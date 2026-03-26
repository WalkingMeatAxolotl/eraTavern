"""API tests: game state, action execution, available actions, definitions."""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))


class TestGameState:
    def test_get_state(self, api_client):
        client, gs = api_client
        r = client.get("/api/game/state")
        assert r.status_code == 200
        data = r.json()
        assert "characters" in data
        assert "maps" in data
        assert "time" in data

    def test_get_definitions(self, api_client):
        client, _ = api_client
        r = client.get("/api/game/definitions")
        assert r.status_code == 200
        data = r.json()
        assert "traitDefs" in data
        assert "itemDefs" in data

    def test_restart_game(self, api_client):
        client, gs = api_client
        gs.time.advance(1000)
        r = client.post("/api/game/restart")
        assert r.status_code == 200
        # Time should reset
        assert gs.time.hour < 24


class TestActionExecution:
    def test_execute_configured_action(self, api_client):
        client, gs = api_client
        player_id = gs.player_character
        r = client.post(
            "/api/game/action",
            json={
                "characterId": player_id,
                "type": "configured",
                "actionId": "test-a.rest",
            },
        )
        assert r.status_code == 200
        data = r.json()
        assert data["success"]

    def test_execute_unknown_action(self, api_client):
        client, gs = api_client
        r = client.post(
            "/api/game/action",
            json={
                "characterId": gs.player_character,
                "type": "configured",
                "actionId": "nonexistent",
            },
        )
        assert r.status_code == 200
        data = r.json()
        assert not data["success"]

    def test_available_actions(self, api_client):
        client, gs = api_client
        player_id = gs.player_character
        r = client.get(f"/api/game/available-actions/{player_id}")
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data["actions"], list)


class TestActionCRUD:
    def test_list_actions(self, api_client):
        client, _ = api_client
        r = client.get("/api/game/actions")
        assert r.status_code == 200
        actions = r.json()["actions"]
        assert any(a["id"] == "test-a.rest" for a in actions)

    def test_create_action(self, api_client):
        client, gs = api_client
        r = client.post(
            "/api/game/actions",
            json={
                "id": "swim",
                "name": "游泳",
                "category": "运动",
                "targetType": "none",
                "timeCost": 30,
                "npcWeight": 0,
                "conditions": [],
                "costs": [],
                "outcomes": [],
                "source": "test-a",
            },
        )
        assert r.status_code == 200
        assert "test-a.swim" in gs.staging.merged_defs("action_defs", gs.action_defs)

    def test_update_action(self, api_client):
        client, gs = api_client
        r = client.put(
            "/api/game/actions/test-a.rest",
            json={
                "id": "test-a.rest",
                "name": "深度休息",
                "category": "日常",
                "targetType": "none",
                "timeCost": 60,
                "npcWeight": 5,
                "conditions": [],
                "costs": [],
                "outcomes": [],
                "source": "test-a",
            },
        )
        assert r.status_code == 200
        assert gs.staging.merged_defs("action_defs", gs.action_defs)["test-a.rest"]["name"] == "深度休息"

    def test_delete_action(self, api_client):
        client, gs = api_client
        r = client.delete("/api/game/actions/test-a.rest")
        assert r.status_code == 200
        assert "test-a.rest" not in gs.staging.merged_defs("action_defs", gs.action_defs)
