"""Additive resource identity migration preserves populated legacy bindings."""
import json
import sqlite3
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config


def legacy_config(tmp_path):
    path = tmp_path / 'history.db'
    with sqlite3.connect(path) as db:
        db.executescript('''
        PRAGMA foreign_keys=ON;
        CREATE TABLE provider_connections(id VARCHAR(36) PRIMARY KEY, name TEXT NOT NULL, provider_type TEXT NOT NULL);
        CREATE TABLE tool_connections(id VARCHAR(36) PRIMARY KEY, name TEXT NOT NULL, tool_type TEXT NOT NULL);
        CREATE TABLE agent_configs(id VARCHAR(36) PRIMARY KEY, provider_connection_id VARCHAR(36) REFERENCES provider_connections(id) ON DELETE RESTRICT);
        CREATE TABLE tool_assignments(id VARCHAR(36) PRIMARY KEY, agent_config_id VARCHAR(36) NOT NULL REFERENCES agent_configs(id) ON DELETE CASCADE, tool_connection_id VARCHAR(36) NOT NULL REFERENCES tool_connections(id) ON DELETE RESTRICT);
        CREATE TABLE alembic_version(version_num VARCHAR(32) PRIMARY KEY);
        INSERT INTO alembic_version VALUES('0013_run_cancellation_status');
        INSERT INTO provider_connections VALUES('provider','Historical Gemini','gemini');
        INSERT INTO tool_connections VALUES('tool','Historical MCP','mcp');
        INSERT INTO agent_configs VALUES('agent','provider');
        INSERT INTO tool_assignments VALUES('assignment','agent','tool');
        ''')
    cfg=Config(str(Path(__file__).resolve().parents[1]/'alembic.ini'))
    cfg.set_main_option('sqlalchemy.url',f'sqlite:///{path}')
    return cfg,path


def test_populated_migration_preserves_bindings_and_safe_original_identity(tmp_path):
    cfg,path=legacy_config(tmp_path)
    command.upgrade(cfg,'head')
    with sqlite3.connect(path) as db:
        db.execute('PRAGMA foreign_keys=ON')
        agent=db.execute('SELECT id, provider_identity_json FROM agent_configs').fetchone()
        assignment=db.execute('SELECT id, tool_identity_json FROM tool_assignments').fetchone()
        assert agent[0]=='agent' and assignment[0]=='assignment'
        assert json.loads(agent[1])=={'id':'provider','name':'Historical Gemini','resource_type':'gemini'}
        assert json.loads(assignment[1])=={'id':'tool','name':'Historical MCP','resource_type':'mcp'}
        db.execute("DELETE FROM provider_connections WHERE id='provider'")
        db.execute("DELETE FROM tool_connections WHERE id='tool'")
        assert db.execute('SELECT provider_connection_id FROM agent_configs').fetchone()==(None,)
        assert db.execute('SELECT tool_connection_id FROM tool_assignments').fetchone()==(None,)
        assert db.execute('PRAGMA foreign_key_check').fetchall()==[]
        db.commit()
    with pytest.raises(RuntimeError,match='would lose history'):
        command.downgrade(cfg,'0013_run_cancellation_status')


def test_migration_can_downgrade_without_deleted_references(tmp_path):
    cfg,path=legacy_config(tmp_path)
    command.upgrade(cfg,'head')
    command.downgrade(cfg,'0013_run_cancellation_status')
    with sqlite3.connect(path) as db:
        assert db.execute('SELECT count(*) FROM tool_assignments').fetchone()==(1,)
        assert 'tool_identity_json' not in {r[1] for r in db.execute('PRAGMA table_info(tool_assignments)')}
