import importlib.util
import json
import secrets
import uuid
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

spec = importlib.util.spec_from_file_location('mission_service', Path(__file__).parents[1] / 'app.py')
service = importlib.util.module_from_spec(spec)
spec.loader.exec_module(service)


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(service, 'DATA', tmp_path / 'data')
    key = tmp_path / 'enrollment'
    key.write_text(secrets.token_urlsafe(48))
    monkeypatch.setattr(service, 'KEY_FILE', key)
    with TestClient(service.app) as c:
        yield c


def create(client, **changes):
    body = {'id': str(uuid.uuid4()), 'conversation_id': 'disposable-conversation', 'read_token': secrets.token_urlsafe(48), **changes}
    headers = {'Authorization': 'Bearer ' + service.KEY_FILE.read_text()}
    response = client.post('/v1/missions', json=body, headers=headers)
    assert response.status_code == 200, response.text
    return body, headers, response.json()


def test_health_and_no_docs(client):
    assert client.get('/health').json() == {'status': 'ok', 'version': '0.1.0'}
    assert client.get('/docs').status_code == 404


def test_creation_requires_auth(client):
    assert client.post('/v1/missions', json={'id': str(uuid.uuid4()), 'conversation_id': 'test-chat-id', 'read_token': 'a' * 48}).status_code == 401


def test_creation_idempotent_and_identity_bound(client):
    body, headers, first = create(client)
    assert client.post('/v1/missions', json=body, headers=headers).json() == first
    assert client.post('/v1/missions', json={**body, 'read_token': 'b' * 48}, headers=headers).status_code == 409
    assert client.post('/v1/missions', json={**body, 'conversation_id': 'different-chat-id'}, headers=headers).status_code == 409


def test_mission_id_is_not_authentication(client):
    body, _, _ = create(client)
    for suffix in ['', '/complete']:
        method = client.get if not suffix else client.post
        assert method('/v1/missions/' + body['id'] + suffix).status_code == 401


def test_read_capability_cannot_complete(client):
    body, _, _ = create(client)
    headers = {'Authorization': 'Bearer ' + body['read_token']}
    assert client.get('/v1/missions/' + body['id'], headers=headers).json()['state'] == 'ACTIVE'
    assert client.post('/v1/missions/' + body['id'] + '/complete', headers=headers).status_code == 401


def test_completion_persistent_and_idempotent(client):
    body, _, _ = create(client)
    path = service.DATA / 'credentials' / (body['id'] + '.json')
    credential = json.loads(path.read_text())
    headers = {'Authorization': 'Bearer ' + credential['token']}
    first = client.post('/v1/missions/' + body['id'] + '/complete', headers=headers).json()
    assert first['state'] == 'COMPLETED'
    assert client.post('/v1/missions/' + body['id'] + '/complete', headers=headers).json() == first
    service.initialize()
    assert client.get('/v1/missions/' + body['id'], headers={'Authorization': 'Bearer ' + body['read_token']}).json() == first


def test_completion_credentials_isolated_and_private(client):
    a, _, _ = create(client)
    b, _, _ = create(client)
    credential = json.loads((service.DATA / 'credentials' / (a['id'] + '.json')).read_text())
    assert client.post('/v1/missions/' + b['id'] + '/complete', headers={'Authorization': 'Bearer ' + credential['token']}).status_code == 401
    assert client.get('/v1/missions/' + b['id'], headers={'Authorization': 'Bearer ' + a['read_token']}).status_code == 401


def test_untrusted_origin_and_invalid_payload(client):
    assert client.get('/health', headers={'Origin': 'https://attacker.invalid'}).status_code == 403
    assert client.post('/v1/missions', json={}).status_code == 422


def test_no_capabilities_in_public_response(client):
    body, _, response = create(client)
    assert set(response) == {'id', 'conversation_id', 'state', 'created_at', 'completed_at'}
    assert body['read_token'] not in json.dumps(response)
