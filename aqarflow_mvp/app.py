"""AqarFlow MVP — clean-room installment-contract transfer marketplace.
Run: uvicorn app:app --reload    (inside this directory)
"""
from __future__ import annotations

import hashlib
import hmac
import os
import re
import secrets
import sqlite3
import threading
import time
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, Depends, Request, Response, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

ROOT = Path(__file__).resolve().parent
DATABASE = os.getenv('AQARFLOW_DB', str(ROOT / 'aqarflow.sqlite3'))
ADMIN_EMAIL = os.getenv('ADMIN_EMAIL', '').strip().lower()
ADMIN_PASSWORD = os.getenv('ADMIN_PASSWORD', '')
COOKIE_SECURE = os.getenv('COOKIE_SECURE', 'false').lower() == 'true'
SESSION_SECONDS = 7 * 24 * 3600
FEE_RATE = Decimal('0.0125')
WRITE_LOCK = threading.RLock()

app = FastAPI(title='AqarFlow MVP API', version='0.1.0', docs_url='/api/docs', redoc_url=None)
app.mount('/static', StaticFiles(directory=str(ROOT / 'static')), name='static')


def connect():
    con = sqlite3.connect(DATABASE, timeout=20, check_same_thread=False)
    con.row_factory = sqlite3.Row
    con.execute('PRAGMA foreign_keys=ON')
    con.execute('PRAGMA busy_timeout=20000')
    return con


def db_query(sql: str, args=(), one=False):
    with connect() as db:
        rows = db.execute(sql, args).fetchall()
    objects = [dict(r) for r in rows]
    return (objects[0] if objects else None) if one else objects


def db_execute(sql, args=()):
    with WRITE_LOCK, connect() as db:
        cur = db.execute(sql, args)
        db.commit()
        return cur.lastrowid


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def hash_password(password: str):
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, 310_000)
    return f"pbkdf2_sha256$310000${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str):
    try:
        _, rounds, salt, digest = stored.split('$')
        check = hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), int(rounds))
        return hmac.compare_digest(check, bytes.fromhex(digest))
    except (ValueError, TypeError):
        return False


def half_up_decimal(value: Decimal):
    return int(value.quantize(Decimal('1'), rounding=ROUND_HALF_UP))


def finance(row: dict):
    paid = int(row['paid_egp'])
    remaining = int(row['remaining_egp'])
    original = paid + remaining
    fee = half_up_decimal(Decimal(original) * FEE_RATE)
    installments = int(row['installment_egp'])
    freq = {'monthly': 1, 'quarterly': 3, 'semiannual': 6, 'annual': 12}.get(row['frequency'], 1)
    market = row.get('market_egp')
    return {
        'contract_egp': original, 'buyer_fee_egp': fee,
        'upfront_egp': paid + fee, 'total_obligation_egp': original + fee,
        'monthly_equivalent_egp': half_up_decimal(Decimal(installments) / Decimal(freq)),
        'market_difference_egp': (int(market) - original - fee) if market is not None else None,
    }


def enrich(row):
    return {**row, **finance(row)}


def init_db():
    Path(DATABASE).parent.mkdir(parents=True, exist_ok=True)
    with WRITE_LOCK, connect() as db:
        db.executescript('''
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
            pass_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user', created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
            token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            csrf TEXT NOT NULL, expires INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS listings (
            id INTEGER PRIMARY KEY, code TEXT UNIQUE NOT NULL, title TEXT NOT NULL,
            developer TEXT NOT NULL, city TEXT NOT NULL, project TEXT NOT NULL,
            property_type TEXT NOT NULL, area_sqm INTEGER NOT NULL, rooms INTEGER NOT NULL,
            paid_egp INTEGER NOT NULL, remaining_egp INTEGER NOT NULL, market_egp INTEGER,
            installment_egp INTEGER NOT NULL, frequency TEXT NOT NULL,
            description TEXT NOT NULL, visual INTEGER NOT NULL DEFAULT 1,
            status TEXT NOT NULL DEFAULT 'pending', seller_id INTEGER REFERENCES users(id),
            created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS favorites (
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
            PRIMARY KEY(user_id, listing_id)
        );
        CREATE TABLE IF NOT EXISTS inquiries (
            id INTEGER PRIMARY KEY, listing_id INTEGER NOT NULL REFERENCES listings(id),
            buyer_id INTEGER NOT NULL REFERENCES users(id), message TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'new', created_at TEXT NOT NULL,
            UNIQUE(listing_id, buyer_id)
        );
        CREATE TABLE IF NOT EXISTS buyer_profiles (
            user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
            cash_egp INTEGER NOT NULL, max_monthly_egp INTEGER NOT NULL,
            max_contract_egp INTEGER NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY, actor_id INTEGER REFERENCES users(id),
            action TEXT NOT NULL, object_type TEXT NOT NULL, object_id INTEGER NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status, created_at);
        CREATE INDEX IF NOT EXISTS idx_inquiries_buyer ON inquiries(buyer_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires);
        ''')
        if ADMIN_EMAIL and ADMIN_PASSWORD:
            if len(ADMIN_PASSWORD) < 12:
                raise RuntimeError('ADMIN_PASSWORD must be at least 12 characters.')
            if not db.execute('SELECT id FROM users WHERE email=?', (ADMIN_EMAIL,)).fetchone():
                db.execute('INSERT INTO users(name,email,pass_hash,role,created_at) VALUES(?,?,?,?,?)',
                           ('Administrateur', ADMIN_EMAIL, hash_password(ADMIN_PASSWORD), 'admin', utc_now()))
        if not db.execute('SELECT 1 FROM listings LIMIT 1').fetchone() and os.getenv('SEED_DEMO', 'true').lower() == 'true':
            demo = [
                ('Terrasse des Jasmins', 'New Giza', 'Le Caire', 'IVY Residence', 'Appartement', 157, 3, 4584865, 7190135, 15000000, 378000, 'quarterly', 1),
                ('Vue Méditerranée', 'Albro', 'Côte Nord', 'Soul Locanda', 'Appartement', 146, 2, 25500000, 16900000, 48000000, 1400000, 'quarterly', 2),
                ('Résidence Lumière', 'Talaat Moustafa', 'Nouvelle capitale', 'Noor', 'Appartement', 123, 2, 2109000, 6581000, 11500000, 311000, 'annual', 3),
                ('Villa Jardins Ouest', 'Orascom', '6 Octobre', 'O West', 'Villa', 195, 4, 4025000, 12210000, 19500000, 372000, 'quarterly', 4),
                ('Studio Horizon', 'Hyde Park', 'New Cairo', 'Hyde Park', 'Studio', 82, 1, 1598000, 7903600, 12000000, 421800, 'quarterly', 5),
                ('Penthouse Azur', 'Emaar', 'Côte Nord', 'Marassi', 'Penthouse', 205, 3, 6450000, 9550000, 19800000, 460000, 'quarterly', 6),
            ]
            for i, d in enumerate(demo, 1):
                title, developer, city, project, kind, sqm, rooms, paid, remaining, market, installment, freq, visual = d
                db.execute('''INSERT INTO listings(code,title,developer,city,project,property_type,area_sqm,rooms,
                    paid_egp,remaining_egp,market_egp,installment_egp,frequency,description,visual,status,created_at,updated_at)
                    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',
                    (f'DEMO-{1000+i}', title, developer, city, project, kind, sqm, rooms, paid, remaining, market,
                    installment, freq, 'Annonce de démonstration — données fictives. Contrat et pièces non vérifiés.', visual,
                    'published', utc_now(), utc_now()))
        db.commit()


init_db()


class Credentials(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)


class Register(Credentials):
    name: str = Field(min_length=2, max_length=100)


class NewListing(BaseModel):
    title: str = Field(min_length=4, max_length=120)
    developer: str = Field(min_length=2, max_length=100)
    city: str = Field(min_length=2, max_length=80)
    project: str = Field(min_length=2, max_length=100)
    property_type: Literal['Appartement', 'Villa', 'Studio', 'Penthouse', 'Duplex', 'Autre']
    area_sqm: int = Field(ge=15, le=10000)
    rooms: int = Field(ge=0, le=30)
    paid_egp: int = Field(ge=0, le=10**12)
    remaining_egp: int = Field(ge=0, le=10**12)
    market_egp: int | None = Field(default=None, ge=0, le=10**12)
    installment_egp: int = Field(gt=0, le=10**12)
    frequency: Literal['monthly', 'quarterly', 'semiannual', 'annual']
    description: str = Field(min_length=10, max_length=1500)

    @model_validator(mode='after')
    def price_rule(self):
        if self.paid_egp + self.remaining_egp <= 0:
            raise ValueError('Le montant du contrat doit être positif.')
        return self


class InquiryCreate(BaseModel):
    message: str = Field(min_length=10, max_length=1200)


class BuyerProfile(BaseModel):
    cash_egp: int = Field(ge=0, le=10**12)
    max_monthly_egp: int = Field(ge=0, le=10**12)
    max_contract_egp: int = Field(ge=0, le=10**12)


class UpdateListing(BaseModel):
    status: Literal['pending', 'published', 'rejected']


class UpdateInquiry(BaseModel):
    status: Literal['new', 'contacted', 'closed']


def current_user(request: Request, csrf_check=False):
    token = request.cookies.get('aqarflow_session')
    if not token:
        raise HTTPException(401, 'Connectez-vous pour continuer.')
    th = hashlib.sha256(token.encode()).hexdigest()
    row = db_query('''SELECT u.id,u.name,u.email,u.role,s.csrf,s.expires
        FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?''', (th,), one=True)
    if not row or row['expires'] < int(time.time()):
        raise HTTPException(401, 'Session expirée. Reconnectez-vous.')
    if csrf_check and not hmac.compare_digest(request.headers.get('x-csrf-token', ''), row['csrf']):
        raise HTTPException(403, 'Jeton de sécurité manquant ou incorrect.')
    return row


def signed_in(req: Request):
    return current_user(req, req.method not in ('GET', 'HEAD', 'OPTIONS'))


def must_admin(user=Depends(signed_in)):
    if user['role'] != 'admin':
        raise HTTPException(403, 'Accès administrateur uniquement.')
    return user


def session_set(response: Response, user_id: int):
    token = secrets.token_urlsafe(32)
    csrf = secrets.token_urlsafe(24)
    db_execute('INSERT INTO sessions(token_hash,user_id,csrf,expires) VALUES(?,?,?,?)',
               (hashlib.sha256(token.encode()).hexdigest(), user_id, csrf, int(time.time()) + SESSION_SECONDS))
    response.set_cookie('aqarflow_session', token, httponly=True, secure=COOKIE_SECURE,
                        samesite='lax', max_age=SESSION_SECONDS, path='/')


def public_user(user):
    return {k: user[k] for k in ['id', 'name', 'email', 'role']}


@app.get('/api/health')
def health():
    return {'ok': True, 'version': '0.1.0'}


@app.post('/api/auth/register', status_code=201)
def register(data: Register, response: Response):
    if len(data.password) < 10:
        raise HTTPException(422, 'Le mot de passe doit contenir au moins 10 caractères.')
    email = str(data.email).strip().lower()
    with WRITE_LOCK:
        if db_query('SELECT 1 AS x FROM users WHERE email=?', (email,), one=True):
            raise HTTPException(409, 'Cette adresse e-mail est déjà utilisée.')
        uid = db_execute('INSERT INTO users(name,email,pass_hash,role,created_at) VALUES(?,?,?,?,?)',
                         (data.name.strip(), email, hash_password(data.password), 'user', utc_now()))
    session_set(response, uid)
    return {'user': {'id': uid, 'name': data.name.strip(), 'email': email, 'role': 'user'}}


@app.post('/api/auth/login')
def login(data: Credentials, response: Response):
    email = str(data.email).strip().lower()
    user = db_query('SELECT * FROM users WHERE email=?', (email,), one=True)
    if not user or not verify_password(data.password, user['pass_hash']):
        raise HTTPException(401, 'Identifiants incorrects.')
    session_set(response, user['id'])
    return {'user': public_user(user)}


@app.post('/api/auth/logout')
def logout(request: Request, response: Response, user=Depends(signed_in)):
    token = request.cookies.get('aqarflow_session', '')
    db_execute('DELETE FROM sessions WHERE token_hash=?', (hashlib.sha256(token.encode()).hexdigest(),))
    response.delete_cookie('aqarflow_session', path='/')
    return {'ok': True}


@app.get('/api/auth/me')
def me(request: Request):
    try:
        user = current_user(request)
        return {'user': public_user(user), 'csrf': user['csrf']}
    except HTTPException:
        return {'user': None, 'csrf': None}


@app.get('/api/stats')
def stats():
    a = db_query("SELECT COUNT(*) AS n FROM listings WHERE status='published'", one=True)['n']
    b = db_query("SELECT COUNT(*) AS n FROM inquiries", one=True)['n']
    c = db_query("SELECT COUNT(DISTINCT project) AS n FROM listings WHERE status='published'", one=True)['n']
    return {'listings': a, 'inquiries': b, 'projects': c, 'demo': os.getenv('SEED_DEMO', 'true').lower() == 'true'}


@app.get('/api/listings')
def list_listings(search: str = Query('', max_length=150), city: str = Query('', max_length=80),
                  max_cash: int | None = Query(None, ge=0), sort: Literal['recent', 'cash', 'advantage'] = 'recent',
                  limit: int = Query(50, ge=1, le=100)):
    rows = db_query("SELECT * FROM listings WHERE status='published'")
    search_lower, city_lower = search.strip().lower(), city.strip().lower()
    result = [enrich(r) for r in rows if
              (not search_lower or any(search_lower in str(r[k]).lower() for k in ('title','project','city','developer','code')))
              and (not city_lower or city_lower in r['city'].lower())]
    if max_cash is not None:
        result = [r for r in result if r['upfront_egp'] <= max_cash]
    if sort == 'cash':
        result.sort(key=lambda x: x['upfront_egp'])
    elif sort == 'advantage':
        result.sort(key=lambda x: x['market_difference_egp'] if x['market_difference_egp'] is not None else -10**20, reverse=True)
    else:
        result.sort(key=lambda x: x['created_at'], reverse=True)
    return {'items': result[:limit], 'total': len(result)}


@app.get('/api/listings/{listing_id}')
def listing_detail(listing_id: int):
    row = db_query("SELECT * FROM listings WHERE id=? AND status='published'", (listing_id,), one=True)
    if not row:
        raise HTTPException(404, 'Annonce introuvable.')
    return enrich(row)


@app.post('/api/listings', status_code=201)
def create_listing(data: NewListing, user=Depends(signed_in)):
    now = utc_now()
    params = (f'USR-{secrets.token_hex(4).upper()}', data.title.strip(), data.developer.strip(), data.city.strip(),
              data.project.strip(), data.property_type, data.area_sqm, data.rooms, data.paid_egp,
              data.remaining_egp, data.market_egp, data.installment_egp, data.frequency,
              data.description.strip(), 2, 'pending', user['id'], now, now)
    lid = db_execute('''INSERT INTO listings(code,title,developer,city,project,property_type,area_sqm,rooms,
        paid_egp,remaining_egp,market_egp,installment_egp,frequency,description,visual,status,seller_id,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''', params)
    db_execute('INSERT INTO audit_log(actor_id,action,object_type,object_id,created_at) VALUES(?,?,?,?,?)',
               (user['id'], 'create', 'listing', lid, now))
    return {'id': lid, 'status': 'pending', 'message': 'Annonce envoyée pour modération.'}


@app.get('/api/me/listings')
def my_listings(user=Depends(signed_in)):
    return [enrich(r) for r in db_query('SELECT * FROM listings WHERE seller_id=? ORDER BY id DESC', (user['id'],))]


@app.post('/api/listings/{listing_id}/inquiries', status_code=201)
def create_inquiry(listing_id: int, data: InquiryCreate, user=Depends(signed_in)):
    listing = db_query("SELECT * FROM listings WHERE id=? AND status='published'", (listing_id,), one=True)
    if not listing:
        raise HTTPException(404, 'Annonce introuvable.')
    if listing['seller_id'] == user['id']:
        raise HTTPException(400, 'Vous ne pouvez pas contacter votre propre annonce.')
    if db_query('SELECT id FROM inquiries WHERE listing_id=? AND buyer_id=?', (listing_id, user['id']), one=True):
        raise HTTPException(409, 'Vous avez déjà envoyé une demande pour cette annonce.')
    try:
        inquiry_id = db_execute('INSERT INTO inquiries(listing_id,buyer_id,message,status,created_at) VALUES(?,?,?,?,?)',
                                (listing_id, user['id'], data.message.strip(), 'new', utc_now()))
    except sqlite3.IntegrityError:
        raise HTTPException(409, 'Demande déjà enregistrée.')
    return {'id': inquiry_id, 'status': 'new'}


@app.get('/api/me/inquiries')
def my_inquiries(user=Depends(signed_in)):
    return db_query('''SELECT i.*,l.title,l.project,l.code FROM inquiries i JOIN listings l ON l.id=i.listing_id
        WHERE i.buyer_id=? ORDER BY i.id DESC''', (user['id'],))


@app.post('/api/listings/{listing_id}/favorite')
def toggle_favorite(listing_id: int, user=Depends(signed_in)):
    if not db_query("SELECT id FROM listings WHERE id=? AND status='published'", (listing_id,), one=True):
        raise HTTPException(404, 'Annonce introuvable.')
    with WRITE_LOCK:
        saved = db_query('SELECT 1 AS x FROM favorites WHERE user_id=? AND listing_id=?',
                         (user['id'], listing_id), one=True)
        if saved:
            db_execute('DELETE FROM favorites WHERE user_id=? AND listing_id=?', (user['id'], listing_id))
        else:
            db_execute('INSERT INTO favorites(user_id,listing_id) VALUES(?,?)', (user['id'], listing_id))
    return {'favorite': not bool(saved)}


@app.get('/api/me/favorites')
def my_favorites(user=Depends(signed_in)):
    rows = db_query('''SELECT l.* FROM listings l JOIN favorites f ON f.listing_id=l.id
        WHERE f.user_id=? AND l.status='published' ORDER BY l.id DESC''', (user['id'],))
    return [enrich(r) for r in rows]


@app.get('/api/me/buyer-profile')
def my_buyer_profile(user=Depends(signed_in)):
    return db_query('SELECT cash_egp,max_monthly_egp,max_contract_egp FROM buyer_profiles WHERE user_id=?',
                    (user['id'],), one=True)


@app.put('/api/me/buyer-profile')
def save_buyer_profile(data: BuyerProfile, user=Depends(signed_in)):
    db_execute('''INSERT INTO buyer_profiles(user_id,cash_egp,max_monthly_egp,max_contract_egp,updated_at)
        VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET
        cash_egp=excluded.cash_egp,max_monthly_egp=excluded.max_monthly_egp,
        max_contract_egp=excluded.max_contract_egp,updated_at=excluded.updated_at''',
        (user['id'], data.cash_egp, data.max_monthly_egp, data.max_contract_egp, utc_now()))
    return {'ok': True}


@app.get('/api/admin/stats')
def admin_stats(user=Depends(must_admin)):
    return {
        'pending': db_query("SELECT COUNT(*) AS n FROM listings WHERE status='pending'", one=True)['n'],
        'published': db_query("SELECT COUNT(*) AS n FROM listings WHERE status='published'", one=True)['n'],
        'inquiries': db_query("SELECT COUNT(*) AS n FROM inquiries WHERE status='new'", one=True)['n'],
        'users': db_query('SELECT COUNT(*) AS n FROM users', one=True)['n'],
    }


@app.get('/api/admin/listings')
def admin_listings(user=Depends(must_admin)):
    return [enrich(r) for r in db_query('SELECT * FROM listings ORDER BY id DESC LIMIT 200')]


@app.patch('/api/admin/listings/{listing_id}')
def admin_update_listing(listing_id: int, data: UpdateListing, user=Depends(must_admin)):
    row = db_query('SELECT id FROM listings WHERE id=?', (listing_id,), one=True)
    if not row:
        raise HTTPException(404, 'Annonce introuvable.')
    db_execute('UPDATE listings SET status=?,updated_at=? WHERE id=?', (data.status, utc_now(), listing_id))
    db_execute('INSERT INTO audit_log(actor_id,action,object_type,object_id,created_at) VALUES(?,?,?,?,?)',
               (user['id'], f'status:{data.status}', 'listing', listing_id, utc_now()))
    return {'id': listing_id, 'status': data.status}


@app.get('/api/admin/inquiries')
def admin_inquiries(user=Depends(must_admin)):
    return db_query('''SELECT i.*,u.name AS buyer_name,u.email AS buyer_email,l.title,l.project,l.code
        FROM inquiries i JOIN users u ON u.id=i.buyer_id JOIN listings l ON l.id=i.listing_id
        ORDER BY i.id DESC LIMIT 200''')


@app.patch('/api/admin/inquiries/{inquiry_id}')
def admin_update_inquiry(inquiry_id: int, data: UpdateInquiry, user=Depends(must_admin)):
    if not db_query('SELECT 1 AS x FROM inquiries WHERE id=?', (inquiry_id,), one=True):
        raise HTTPException(404, 'Demande introuvable.')
    db_execute('UPDATE inquiries SET status=? WHERE id=?', (data.status, inquiry_id))
    db_execute('INSERT INTO audit_log(actor_id,action,object_type,object_id,created_at) VALUES(?,?,?,?,?)',
               (user['id'], f'status:{data.status}', 'inquiry', inquiry_id, utc_now()))
    return {'id': inquiry_id, 'status': data.status}


@app.get('/')
def index():
    return FileResponse(ROOT / 'static' / 'index.html')