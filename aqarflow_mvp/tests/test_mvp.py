"""End-to-end API tests; temporary SQLite database and environment."""
import os
import tempfile
from pathlib import Path

def test_core_user_journey():
    with tempfile.TemporaryDirectory() as td:
        os.environ['AQARFLOW_DB'] = str(Path(td)/'test.sqlite3')
        os.environ['ADMIN_EMAIL'] = 'admin@test.example'
        os.environ['ADMIN_PASSWORD'] = 'a-very-long-demo-secret-123'
        os.environ['SEED_DEMO'] = 'true'
        from importlib import reload
        import app as source
        reload(source)
        from fastapi.testclient import TestClient
        with TestClient(source.app) as buyer, TestClient(source.app) as admin:
            assert buyer.get('/api/health').json()['ok']
            sample = buyer.get('/api/listings').json()
            assert sample['total'] == 6
            first = sample['items'][0]
            assert first['contract_egp'] == first['paid_egp'] + first['remaining_egp']
            assert first['upfront_egp'] == first['paid_egp'] + first['buyer_fee_egp']
            assert buyer.post(f"/api/listings/{first['id']}/favorite").status_code == 401
            assert buyer.post('/api/auth/register',json={'name':'Demo Buyer','email':'buyer@test.example','password':'buyerpassword123'}).status_code == 201
            csrf=buyer.get('/api/auth/me').json()['csrf']
            auth={'X-CSRF-Token':csrf}
            assert buyer.post(f"/api/listings/{first['id']}/favorite",headers=auth).json()['favorite']
            assert len(buyer.get('/api/me/favorites').json()) == 1
            assert buyer.post(f"/api/listings/{first['id']}/inquiries",json={'message':'Je souhaite en savoir plus sur ce bien.'},headers=auth).status_code == 201
            assert buyer.post(f"/api/listings/{first['id']}/inquiries",json={'message':'Je souhaite en savoir plus sur ce bien.'},headers=auth).status_code == 409
            assert len(buyer.get('/api/me/inquiries').json()) == 1
            assert buyer.post('/api/listings',json={'title':'Appartement de test','developer':'Demo developer','city':'New Cairo','project':'Demo project','property_type':'Appartement','area_sqm':95,'rooms':2,'paid_egp':2200000,'remaining_egp':4800000,'market_egp':8000000,'installment_egp':125000,'frequency':'quarterly','description':'Un appartement avec vue sur le jardin.'}).status_code == 403
            res=buyer.post('/api/listings',json={'title':'Appartement de test','developer':'Demo developer','city':'New Cairo','project':'Demo project','property_type':'Appartement','area_sqm':95,'rooms':2,'paid_egp':2200000,'remaining_egp':4800000,'market_egp':8000000,'installment_egp':125000,'frequency':'quarterly','description':'Un appartement avec vue sur le jardin.'},headers=auth)
            assert res.status_code==201, res.text
            lid=res.json()['id']
            assert buyer.get(f'/api/listings/{lid}').status_code==404
            assert buyer.get('/api/admin/listings').status_code==403
            assert buyer.put('/api/me/buyer-profile',headers=auth,json={'cash_egp':3000000,'max_monthly_egp':50000,'max_contract_egp':10000000}).status_code==200
            assert buyer.get('/api/me/buyer-profile').json()['cash_egp']==3000000
            assert admin.post('/api/auth/login',json={'email':'admin@test.example','password':'a-very-long-demo-secret-123'}).status_code == 200
            admin_csrf=admin.get('/api/auth/me').json()['csrf']
            assert admin.get('/api/admin/stats').json()['pending']==1
            assert admin.patch(f'/api/admin/listings/{lid}',json={'status':'published'},headers={'X-CSRF-Token':admin_csrf}).status_code == 200
            assert buyer.get(f'/api/listings/{lid}').status_code == 200
            assert buyer.get('/api/listings?max_cash=1000').json()['total'] == 0
            assert len(admin.get('/api/admin/inquiries').json()) == 1
            iq=admin.get('/api/admin/inquiries').json()[0]['id']
            assert admin.patch(f'/api/admin/inquiries/{iq}',json={'status':'contacted'},headers={'X-CSRF-Token':admin_csrf}).status_code == 200
            assert buyer.get('/api/me/inquiries').json()[0]['status'] == 'contacted'
            assert buyer.post('/api/auth/logout',headers=auth).status_code == 200
            assert buyer.get('/api/auth/me').json()['user'] is None
