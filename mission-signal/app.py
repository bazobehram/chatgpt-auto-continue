"""Mission Signal 0.1.0: no CommandCore dependencies or credentials."""
import hashlib
import hmac
import json
import os
import secrets
import sqlite3
import time
from contextlib import asynccontextmanager, contextmanager
from pathlib import Path
from uuid import UUID

from fastapi import FastAPI, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

DATA = Path(os.environ.get('MISSION_DATA', '/data'))
KEY_FILE = Path(os.environ.get('MISSION_ENROLLMENT_FILE', '/run/secrets/enrollment'))
EXTENSION_ORIGIN = os.environ.get('MISSION_EXTENSION_ORIGIN', 'chrome-extension://nieinjacjejclbomhndjaabjnpjnbapf')


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def check_token(authorization, expected_hash):
    value = (authorization or '').removeprefix('Bearer ')
    if not authorization or not authorization.startswith('Bearer ') or not hmac.compare_digest(digest(value), expected_hash):
        raise HTTPException(401, 'Authentication required')


@contextmanager
def database():
    con = sqlite3.connect(DATA / 'missions.sqlite3', timeout=10)
    try:
        con.row_factory = sqlite3.Row
        con.execute('PRAGMA busy_timeout=10000')
        with con:
            yield con
    finally:
        con.close()


def initialize():
    DATA.mkdir(parents=True, exist_ok=True)
    (DATA / 'credentials').mkdir(mode=0o700, exist_ok=True)
    if len(KEY_FILE.read_text().strip()) < 32:
        raise RuntimeError('An enrollment credential of at least32 characters is required')
    with database() as con:
        con.execute('PRAGMA journal_mode=WAL')
        con.execute('''CREATE TABLE IF NOT EXISTS missions (
            id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, read_hash TEXT NOT NULL,
            completion_hash TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'ACTIVE',
            created_at INTEGER NOT NULL, completed_at INTEGER)''')


@asynccontextmanager
async def lifespan(_app):
    initialize()
    yield


app = FastAPI(title='Mission Signal', version='0.1.0', lifespan=lifespan,
              docs_url=None, redoc_url=None, openapi_url=None)


@app.middleware('http')
async def restrict_origin(request: Request, call_next):
    origin = request.headers.get('origin')
    if origin and origin != EXTENSION_ORIGIN:
        from fastapi.responses import JSONResponse
        return JSONResponse({'detail': 'Origin not allowed'}, status_code=403)
    if int(request.headers.get('content-length', '0') or '0') > 4096:
        from fastapi.responses import JSONResponse
        return JSONResponse({'detail': 'Request too large'}, status_code=413)
    response = await call_next(request)
    response.headers['Cache-Control'] = 'no-store'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    return response


class Creation(BaseModel):
    model_config = ConfigDict(extra='forbid')
    id: UUID
    conversation_id: str = Field(min_length=10, max_length=120, pattern=r'^[A-Za-z0-9_-]+$')
    read_token: str = Field(min_length=40, max_length=128, pattern=r'^[A-Za-z0-9_-]+$')


def public(row):
    return {key: row[key] for key in ('id', 'conversation_id', 'state', 'created_at', 'completed_at')}


@app.get('/health')
def health():
    with database() as con:
        con.execute('SELECT 1').fetchone()
    return {'status': 'ok', 'version': '0.1.0'}


@app.post('/v1/missions')
def create(body: Creation, authorization: str | None = Header(default=None)):
    check_token(authorization, digest(KEY_FILE.read_text().strip()))
    mission_id = str(body.id)
    with database() as con:
        con.execute('BEGIN IMMEDIATE')
        row = con.execute('SELECT * FROM missions WHERE id=?', (mission_id,)).fetchone()
        if row:
            if row['conversation_id'] != body.conversation_id or not hmac.compare_digest(row['read_hash'], digest(body.read_token)):
                raise HTTPException(409, 'Mission identity conflict')
            return public(row)
        # Completion capability lives only on homeserver. Chrome receives no completion secret.
        completion = secrets.token_urlsafe(48)
        credential = DATA / 'credentials' / f'{mission_id}.json'
        # Atomic replacement also repairs an orphan capability after a process crash before DB commit.
        temporary = credential.with_suffix('.tmp')
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, 'w') as out:
            json.dump({'id': mission_id, 'token': completion}, out)
            out.flush()
            os.fsync(out.fileno())
        os.replace(temporary, credential)
        con.execute('INSERT INTO missions (id,conversation_id,read_hash,completion_hash,created_at) VALUES (?,?,?,?,?)',
                    (mission_id, body.conversation_id, digest(body.read_token), digest(completion), int(time.time())))
        return public(con.execute('SELECT * FROM missions WHERE id=?', (mission_id,)).fetchone())


def authorized_row(con, mission_id, authorization, purpose):
    row = con.execute('SELECT * FROM missions WHERE id=?', (str(mission_id),)).fetchone()
    if not row:
        raise HTTPException(404, 'Mission not found')
    check_token(authorization, row[purpose + '_hash'])
    return row


@app.get('/v1/missions/{mission_id}')
def status(mission_id: UUID, authorization: str | None = Header(default=None)):
    with database() as con:
        return public(authorized_row(con, mission_id, authorization, 'read'))


@app.post('/v1/missions/{mission_id}/complete')
def complete(mission_id: UUID, authorization: str | None = Header(default=None)):
    with database() as con:
        con.execute('BEGIN IMMEDIATE')
        authorized_row(con, mission_id, authorization, 'completion')
        con.execute("UPDATE missions SET state='COMPLETED', completed_at=? WHERE id=? AND state='ACTIVE'", (int(time.time()), str(mission_id)))
        return public(con.execute('SELECT * FROM missions WHERE id=?', (str(mission_id),)).fetchone())
