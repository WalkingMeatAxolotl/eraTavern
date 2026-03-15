"""API tests: session, world select/unload, save/save-as."""

from __future__ import annotations

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))


class TestSessionEndpoints:
    def test_get_session(self, api_client):
        client, gs = api_client
        r = client.get("/api/session")
        assert r.status_code == 200
        data = r.json()
        assert data["worldId"] == "test-world"
        assert data["worldName"] == "测试世界"
        assert "addons" in data

    def test_save_session(self, api_client):
        client, gs = api_client
        gs.dirty = True
        r = client.post("/api/session/save")
        assert r.status_code == 200
        assert gs.dirty is False

    def test_get_config(self, api_client):
        client, _ = api_client
        r = client.get("/api/config")
        assert r.status_code == 200
        assert "maxWidth" in r.json()


class TestWorldSelect:
    def test_select_world(self, api_client):
        client, gs = api_client
        r = client.post("/api/worlds/select", json={"worldId": "test-world"})
        assert r.status_code == 200
        assert gs.world_id == "test-world"

    def test_select_nonexistent_world(self, api_client):
        client, _ = api_client
        r = client.post("/api/worlds/select", json={"worldId": "nope"})
        assert r.status_code != 200 or not r.json().get("success", True)

    def test_unload_world(self, api_client):
        client, gs = api_client
        r = client.post("/api/worlds/unload")
        assert r.status_code == 200
        assert gs.world_id == ""

    def test_list_worlds(self, api_client):
        client, _ = api_client
        r = client.get("/api/worlds")
        assert r.status_code == 200
        data = r.json()
        assert any(w["id"] == "test-world" for w in data["worlds"])


class TestSaveSlots:
    def test_create_and_list_save(self, api_client):
        client, gs = api_client
        r = client.post("/api/saves", json={"slotId": "slot1", "name": "测试存档"})
        assert r.status_code == 200

        r2 = client.get("/api/saves")
        assert r2.status_code == 200
        saves = r2.json()["saves"]
        assert any(s["slotId"] == "slot1" for s in saves)

    def test_load_save(self, api_client):
        client, gs = api_client
        # Create save
        client.post("/api/saves", json={"slotId": "slot1", "name": "测试"})
        # Modify state
        player_id = gs.player_character
        gs.characters[player_id]["resources"]["stamina"]["value"] = 999
        # Load save (should restore)
        r = client.post("/api/saves/slot1/load")
        assert r.status_code == 200

    def test_delete_save(self, api_client):
        client, gs = api_client
        client.post("/api/saves", json={"slotId": "slot1", "name": "测试"})
        r = client.delete("/api/saves/slot1")
        assert r.status_code == 200

        saves = client.get("/api/saves").json()["saves"]
        assert not any(s["slotId"] == "slot1" for s in saves)

    def test_rename_save(self, api_client):
        client, gs = api_client
        client.post("/api/saves", json={"slotId": "slot1", "name": "旧名"})
        r = client.patch("/api/saves/slot1", json={"name": "新名"})
        assert r.status_code == 200
