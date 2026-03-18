"""API tests: character, trait, item, clothing, map CRUD endpoints."""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))


class TestCharacterCRUD:
    def test_list_characters(self, api_client):
        client, _ = api_client
        r = client.get("/api/game/characters/config")
        assert r.status_code == 200
        chars = r.json()["characters"]
        assert len(chars) >= 2

    def test_get_character(self, api_client):
        client, gs = api_client
        r = client.get(f"/api/game/characters/config/{gs.player_character}")
        assert r.status_code == 200
        data = r.json()
        assert data["basicInfo"]["name"] == "测试玩家"

    def test_create_character(self, api_client):
        client, gs = api_client
        r = client.post(
            "/api/game/characters/config",
            json={
                "id": "npc3",
                "source": "test-a",
                "basicInfo": {"name": "新NPC"},
                "isPlayer": False,
                "position": {"mapId": "test-a.tavern", "cellId": 1},
            },
        )
        assert r.status_code == 200
        assert "test-a.npc3" in gs.character_data

    def test_update_character(self, api_client):
        client, gs = api_client
        char_id = "test-a.npc1"
        current = gs.character_data[char_id].copy()
        current["basicInfo"]["name"] = "改名女仆"
        r = client.put(f"/api/game/characters/config/{char_id}", json=current)
        assert r.status_code == 200
        assert gs.character_data[char_id]["basicInfo"]["name"] == "改名女仆"

    def test_delete_character(self, api_client):
        client, gs = api_client
        r = client.delete("/api/game/characters/config/test-a.npc1")
        assert r.status_code == 200
        assert "test-a.npc1" not in gs.character_data

    def test_patch_character_active(self, api_client):
        client, gs = api_client
        r = client.patch("/api/game/characters/config/test-a.npc1", json={"active": False})
        assert r.status_code == 200
        assert gs.character_data["test-a.npc1"]["active"] is False

    def test_cannot_freeze_player(self, api_client):
        client, gs = api_client
        r = client.patch(f"/api/game/characters/config/{gs.player_character}", json={"active": False})
        assert r.status_code == 200
        # Player should still be active
        assert gs.character_data[gs.player_character].get("active", True) is True

    def test_create_character_rejects_dot_in_local_id(self, api_client):
        """ID with dot in local part should be rejected."""
        client, _ = api_client
        r = client.post(
            "/api/game/characters/config",
            json={
                "id": "bad.dot.id",
                "source": "test-a",
                "basicInfo": {"name": "Invalid"},
            },
        )
        data = r.json()
        assert data.get("success") is False


class TestTraitCRUD:
    def test_list_traits(self, api_client):
        client, _ = api_client
        r = client.get("/api/game/traits")
        assert r.status_code == 200
        traits = r.json()["traits"]
        assert any(t["id"] == "test-a.human" for t in traits)

    def test_create_trait(self, api_client):
        client, gs = api_client
        r = client.post(
            "/api/game/traits",
            json={
                "id": "brave",
                "name": "勇敢",
                "category": "personality",
                "source": "test-a",
            },
        )
        assert r.status_code == 200
        assert "test-a.brave" in gs.trait_defs

    def test_update_trait(self, api_client):
        client, gs = api_client
        r = client.put(
            "/api/game/traits/test-a.human",
            json={
                "id": "test-a.human",
                "name": "人类（改）",
                "category": "race",
                "source": "test-a",
            },
        )
        assert r.status_code == 200
        assert gs.trait_defs["test-a.human"]["name"] == "人类（改）"

    def test_delete_trait(self, api_client):
        client, gs = api_client
        r = client.delete("/api/game/traits/test-a.stealth")
        assert r.status_code == 200
        assert "test-a.stealth" not in gs.trait_defs


class TestItemCRUD:
    def test_list_items(self, api_client):
        client, _ = api_client
        r = client.get("/api/game/items")
        assert r.status_code == 200
        data = r.json()
        assert any(i["id"] == "test-a.potion" for i in data["items"])

    def test_create_item(self, api_client):
        client, gs = api_client
        r = client.post(
            "/api/game/items",
            json={
                "id": "sword",
                "name": "铁剑",
                "tags": ["weapon"],
                "source": "test-a",
            },
        )
        assert r.status_code == 200
        assert "test-a.sword" in gs.item_defs

    def test_delete_item(self, api_client):
        client, gs = api_client
        r = client.delete("/api/game/items/test-a.key")
        assert r.status_code == 200
        assert "test-a.key" not in gs.item_defs


class TestClothingCRUD:
    def test_list_clothing(self, api_client):
        client, _ = api_client
        r = client.get("/api/game/clothing")
        assert r.status_code == 200
        clothing = r.json()["clothing"]
        assert any(c["id"] == "test-a.shirt" for c in clothing)

    def test_create_clothing(self, api_client):
        client, gs = api_client
        r = client.post(
            "/api/game/clothing",
            json={
                "id": "hat",
                "name": "帽子",
                "slot": "head",
                "source": "test-a",
            },
        )
        assert r.status_code == 200
        assert "test-a.hat" in gs.clothing_defs

    def test_delete_clothing(self, api_client):
        client, gs = api_client
        r = client.delete("/api/game/clothing/test-a.shirt")
        assert r.status_code == 200
        assert "test-a.shirt" not in gs.clothing_defs


class TestMapCRUD:
    def test_list_maps(self, api_client):
        client, _ = api_client
        r = client.get("/api/game/maps/raw")
        assert r.status_code == 200
        maps = r.json()["maps"]
        assert any(m["id"] == "test-a.tavern" for m in maps)

    def test_get_map(self, api_client):
        client, _ = api_client
        r = client.get("/api/game/maps/raw/test-a.tavern")
        assert r.status_code == 200
        data = r.json()
        assert data["name"] == "酒馆"

    def test_create_map(self, api_client):
        client, gs = api_client
        r = client.post(
            "/api/game/maps",
            json={
                "id": "test-a.forest",
                "name": "森林",
                "rows": 1,
                "cols": 1,
            },
        )
        assert r.status_code == 200
        assert "test-a.forest" in gs.maps

    def test_delete_map(self, api_client):
        client, gs = api_client
        r = client.delete("/api/game/maps/test-a.tavern")
        assert r.status_code == 200
        assert "test-a.tavern" not in gs.maps
