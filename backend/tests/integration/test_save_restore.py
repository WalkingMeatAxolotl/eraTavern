"""Integration tests: snapshot_save_data / restore_save_data round-trip."""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))


class TestSnapshotRoundTrip:
    """snapshot_save_data → restore_save_data preserves state."""

    def test_time_preserved(self, test_env):
        gs, _ = test_env
        gs.time.advance(120)  # advance 2 hours
        snapshot = gs.snapshot_save_data()

        # Reset time
        gs.time = type(gs.time)()
        assert gs.time.hour != snapshot["time"]["hour"]

        # Restore
        gs.restore_save_data(snapshot)
        assert gs.time.hour == snapshot["time"]["hour"]
        assert gs.time.minute == snapshot["time"]["minute"]

    def test_character_position_preserved(self, test_env):
        gs, _ = test_env
        player_id = gs.player_character
        gs.characters[player_id]["position"]["cellId"] = 2

        snapshot = gs.snapshot_save_data()

        # Mutate position after snapshot — deep copy should isolate
        gs.characters[player_id]["position"]["cellId"] = 1
        gs.character_data[player_id]["position"]["cellId"] = 1
        gs.restore_save_data(snapshot)

        assert gs.characters[player_id]["position"]["cellId"] == 2

    def test_resource_values_preserved(self, test_env):
        gs, _ = test_env
        player_id = gs.player_character
        gs.characters[player_id]["resources"]["stamina"]["value"] = 500

        snapshot = gs.snapshot_save_data()
        gs.characters[player_id]["resources"]["stamina"]["value"] = 1000
        gs.restore_save_data(snapshot)

        assert gs.characters[player_id]["resources"]["stamina"]["value"] == 500

    def test_ability_exp_preserved(self, test_env):
        gs, _ = test_env
        player_id = gs.player_character
        # Find cooking ability and change exp
        for ab in gs.characters[player_id].get("abilities", []):
            if ab["key"] == "test-a.cooking":
                ab["exp"] = 9999
                break

        snapshot = gs.snapshot_save_data()

        # Reset
        for ab in gs.characters[player_id].get("abilities", []):
            if ab["key"] == "test-a.cooking":
                ab["exp"] = 0
                break

        gs.restore_save_data(snapshot)

        # Check restored
        for ab in gs.characters[player_id].get("abilities", []):
            if ab["key"] == "test-a.cooking":
                assert ab["exp"] == 9999
                break

    def test_inventory_preserved(self, test_env):
        gs, _ = test_env
        player_id = gs.player_character
        gs.characters[player_id]["inventory"] = [
            {"itemId": "test-a.potion", "name": "药水", "tags": [], "amount": 10},
        ]

        snapshot = gs.snapshot_save_data()
        gs.characters[player_id]["inventory"] = []
        gs.restore_save_data(snapshot)

        inv = gs.characters[player_id]["inventory"]
        assert len(inv) > 0

    def test_decay_accumulators_preserved(self, test_env):
        gs, _ = test_env
        gs.decay_accumulators = {"test-a.player1": {"test-a.cooking": 3}}

        snapshot = gs.snapshot_save_data()
        gs.decay_accumulators = {}
        gs.restore_save_data(snapshot)

        assert gs.decay_accumulators["test-a.player1"]["test-a.cooking"] == 3

    def test_npc_activities_preserved(self, test_env):
        gs, _ = test_env
        gs.npc_activities = {"test-a.npc1": "正在做饭"}

        snapshot = gs.snapshot_save_data()
        gs.npc_activities = {}
        gs.restore_save_data(snapshot)

        assert gs.npc_activities["test-a.npc1"] == "正在做饭"

    def test_world_variables_preserved(self, test_env):
        gs, _ = test_env
        gs.world_variables["test-a.danger"] = 50

        snapshot = gs.snapshot_save_data()
        gs.world_variables["test-a.danger"] = 0
        gs.restore_save_data(snapshot)

        assert gs.world_variables.get("test-a.danger") == 50

    def test_npc_goals_reset_on_restore(self, test_env):
        """NPC goals should be cleared on restore (NPCs re-decide)."""
        gs, _ = test_env
        gs.npc_goals["test-a.npc1"] = {"actionId": "rest", "remaining": 5}

        snapshot = gs.snapshot_save_data()
        gs.restore_save_data(snapshot)

        assert gs.npc_goals == {}

    def test_event_state_preserved(self, test_env):
        gs, _ = test_env
        gs.event_state = {"some-event": {"completed": True}}

        snapshot = gs.snapshot_save_data()
        gs.event_state = {}
        gs.restore_save_data(snapshot)

        assert gs.event_state["some-event"]["completed"] is True


class TestSnapshotLogTrimming:
    """Logs are trimmed to 30 game days when saving."""

    def test_old_npc_logs_trimmed(self, test_env):
        gs, _ = test_env
        current_days = gs.time.total_days
        gs.npc_full_log = [
            {"text": "old", "totalDays": current_days - 60},  # too old
            {"text": "recent", "totalDays": current_days - 10},  # within 30 days
        ]

        snapshot = gs.snapshot_save_data()
        assert len(snapshot["npcFullLog"]) == 1
        assert snapshot["npcFullLog"][0]["text"] == "recent"

    def test_old_action_logs_trimmed(self, test_env):
        gs, _ = test_env
        current_days = gs.time.total_days
        gs.action_log = [
            {"text": "old", "totalDays": current_days - 60},
            {"text": "recent", "totalDays": current_days - 5},
        ]

        snapshot = gs.snapshot_save_data()
        assert len(snapshot["actionLog"]) == 1
        assert snapshot["actionLog"][0]["text"] == "recent"


class TestInactiveCharacters:
    """active=False characters are excluded from runtime state."""

    def test_inactive_not_in_characters(self, test_env):
        gs, _ = test_env
        # Set NPC as inactive
        gs.character_data["test-a.npc1"]["active"] = False

        # Rebuild characters
        from game.character import build_character_state
        gs.characters = {}
        for char_id, char_data in gs.character_data.items():
            if char_data.get("active", True) is False:
                continue
            gs.characters[char_id] = build_character_state(
                char_data, gs.template, gs.clothing_defs, gs.trait_defs,
                gs.item_defs,
            )

        assert "test-a.npc1" not in gs.characters
        assert "test-a.player1" in gs.characters

    def test_inactive_still_in_character_data(self, test_env):
        """character_data retains inactive characters (definitions persist)."""
        gs, _ = test_env
        gs.character_data["test-a.npc1"]["active"] = False
        assert "test-a.npc1" in gs.character_data
