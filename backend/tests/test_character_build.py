"""Tests for build_character_state and build_clothing_state."""

from __future__ import annotations

from game.character import build_character_state, build_clothing_state, exp_to_grade

# ---------------------------------------------------------------------------
# Helper factories
# ---------------------------------------------------------------------------


def make_template(**overrides):
    """Build a minimal character template dict."""
    tpl = {
        "basicInfo": [
            {"key": "name", "label": "名称", "type": "string", "defaultValue": ""},
            {"key": "money", "label": "金钱", "type": "number", "defaultValue": 0},
        ],
        "resources": [
            {"key": "stamina", "label": "体力", "defaultMax": 2000, "defaultValue": 2000, "color": "#FFFF00"},
            {"key": "energy", "label": "气力", "defaultMax": 2000, "defaultValue": 2000, "color": "#00FFFF"},
        ],
        "clothingSlots": ["hat", "upperBody", "lowerBody", "feet"],
        "traits": [
            {"key": "race", "label": "种族", "multiple": True},
            {"key": "ability", "label": "能力", "multiple": True},
            {"key": "experience", "label": "经验", "multiple": True},
        ],
        "inventory": [],
        "abilities": [],
        "experiences": [],
    }
    tpl.update(overrides)
    return tpl


def make_char_data(**overrides):
    """Build a minimal raw character data dict."""
    data = {
        "id": "addon1.char1",
        "isPlayer": False,
        "basicInfo": {"name": "Alice", "money": 500},
        "resources": {"stamina": {"value": 1500, "max": 2000}},
        "clothing": {},
        "traits": {"race": ["addon1.human"]},
        "abilities": {},
        "experiences": {},
        "inventory": [],
        "position": {"mapId": "map1", "cellId": 1},
        "restPosition": {"mapId": "map1", "cellId": 0},
        "favorability": {},
    }
    data.update(overrides)
    return data


# ---------------------------------------------------------------------------
# exp_to_grade
# ---------------------------------------------------------------------------


class TestExpToGrade:
    def test_zero(self):
        assert exp_to_grade(0) == "G"

    def test_boundaries(self):
        assert exp_to_grade(999) == "G"
        assert exp_to_grade(1000) == "F"
        assert exp_to_grade(1999) == "F"
        assert exp_to_grade(2000) == "E"
        assert exp_to_grade(3000) == "D"
        assert exp_to_grade(4000) == "C"
        assert exp_to_grade(5000) == "B"
        assert exp_to_grade(6000) == "A"

    def test_max_grade(self):
        assert exp_to_grade(7000) == "S"
        assert exp_to_grade(99999) == "S"

    def test_negative_clamped(self):
        # negative exp should clamp to index 0
        assert exp_to_grade(-100) == "G"


# ---------------------------------------------------------------------------
# build_character_state — identity fields
# ---------------------------------------------------------------------------


class TestBuildCharacterStateIdentity:
    def test_id_set(self):
        state = build_character_state(make_char_data(), make_template(), {})
        assert state["id"] == "addon1.char1"

    def test_is_player_false(self):
        state = build_character_state(make_char_data(), make_template(), {})
        assert state["isPlayer"] is False

    def test_is_player_true(self):
        data = make_char_data(isPlayer=True)
        state = build_character_state(data, make_template(), {})
        assert state["isPlayer"] is True

    def test_is_player_defaults_false(self):
        data = make_char_data()
        del data["isPlayer"]
        state = build_character_state(data, make_template(), {})
        assert state["isPlayer"] is False


# ---------------------------------------------------------------------------
# build_character_state — basicInfo
# ---------------------------------------------------------------------------


class TestBuildCharacterStateBasicInfo:
    def test_values_from_char_data(self):
        state = build_character_state(make_char_data(), make_template(), {})
        assert state["basicInfo"]["name"]["value"] == "Alice"
        assert state["basicInfo"]["money"]["value"] == 500

    def test_label_and_type_from_template(self):
        state = build_character_state(make_char_data(), make_template(), {})
        assert state["basicInfo"]["name"]["label"] == "名称"
        assert state["basicInfo"]["name"]["type"] == "string"
        assert state["basicInfo"]["money"]["type"] == "number"

    def test_missing_values_use_template_defaults(self):
        data = make_char_data(basicInfo={})
        state = build_character_state(data, make_template(), {})
        assert state["basicInfo"]["name"]["value"] == ""
        assert state["basicInfo"]["money"]["value"] == 0


# ---------------------------------------------------------------------------
# build_character_state — resources
# ---------------------------------------------------------------------------


class TestBuildCharacterStateResources:
    def test_values_from_char_data(self):
        state = build_character_state(make_char_data(), make_template(), {})
        res = state["resources"]["stamina"]
        assert res["value"] == 1500
        assert res["max"] == 2000
        assert res["label"] == "体力"
        assert res["color"] == "#FFFF00"

    def test_missing_resource_uses_template_defaults(self):
        state = build_character_state(make_char_data(), make_template(), {})
        res = state["resources"]["energy"]
        assert res["value"] == 2000
        assert res["max"] == 2000


# ---------------------------------------------------------------------------
# build_clothing_state
# ---------------------------------------------------------------------------


class TestBuildClothingState:
    def test_empty_clothing(self):
        result = build_clothing_state({}, ["hat", "upperBody"], {})
        assert len(result) == 2
        assert result[0]["slot"] == "hat"
        assert result[0]["itemId"] is None
        assert result[0]["occluded"] is False

    def test_worn_item_displayed(self):
        char_clothing = {"hat": {"itemId": "addon1.hat1", "state": "worn"}}
        clothing_defs = {"addon1.hat1": {"name": "红帽子", "occlusion": []}}
        result = build_clothing_state(char_clothing, ["hat", "upperBody"], clothing_defs)
        hat = result[0]
        assert hat["itemId"] == "addon1.hat1"
        assert hat["itemName"] == "红帽子"
        assert hat["state"] == "worn"

    def test_worn_item_causes_occlusion(self):
        char_clothing = {
            "upperBody": {"itemId": "addon1.dress", "state": "worn"},
        }
        clothing_defs = {
            "addon1.dress": {"name": "长裙", "occlusion": ["lowerBody"]},
        }
        slots = ["upperBody", "lowerBody"]
        result = build_clothing_state(char_clothing, slots, clothing_defs)
        lower = [r for r in result if r["slot"] == "lowerBody"][0]
        assert lower["occluded"] is True

    def test_halfworn_does_not_cause_occlusion(self):
        char_clothing = {
            "upperBody": {"itemId": "addon1.dress", "state": "halfWorn"},
        }
        clothing_defs = {
            "addon1.dress": {"name": "长裙", "occlusion": ["lowerBody"]},
        }
        slots = ["upperBody", "lowerBody"]
        result = build_clothing_state(char_clothing, slots, clothing_defs)
        lower = [r for r in result if r["slot"] == "lowerBody"][0]
        assert lower["occluded"] is False

    def test_none_state_no_occlusion(self):
        # An item with state "none" shouldn't cause occlusion
        char_clothing = {
            "upperBody": {"itemId": "addon1.dress", "state": "none"},
        }
        clothing_defs = {
            "addon1.dress": {"name": "长裙", "occlusion": ["lowerBody"]},
        }
        slots = ["upperBody", "lowerBody"]
        result = build_clothing_state(char_clothing, slots, clothing_defs)
        lower = [r for r in result if r["slot"] == "lowerBody"][0]
        assert lower["occluded"] is False

    def test_missing_clothing_def_shows_local_id(self):
        char_clothing = {"hat": {"itemId": "addon1.mystery", "state": "worn"}}
        result = build_clothing_state(char_clothing, ["hat"], {})
        assert result[0]["itemName"] == "mystery"


# ---------------------------------------------------------------------------
# build_character_state — traits
# ---------------------------------------------------------------------------


class TestBuildCharacterStateTraits:
    def test_ability_and_experience_categories_skipped(self):
        state = build_character_state(make_char_data(), make_template(), {})
        trait_keys = [t["key"] for t in state["traits"]]
        assert "ability" not in trait_keys
        assert "experience" not in trait_keys
        assert "race" in trait_keys

    def test_trait_ids_resolved_via_trait_defs(self):
        trait_defs = {
            "addon1.human": {"id": "addon1.human", "name": "人类", "category": "race"},
        }
        state = build_character_state(make_char_data(), make_template(), {}, trait_defs=trait_defs)
        race_trait = [t for t in state["traits"] if t["key"] == "race"][0]
        assert race_trait["values"] == ["人类"]

    def test_dangling_trait_ref_shows_local_id(self):
        # trait_defs provided but doesn't contain the referenced trait
        trait_defs = {}
        data = make_char_data(traits={"race": ["addon1.elf"]})
        state = build_character_state(data, make_template(), {}, trait_defs=trait_defs)
        race_trait = [t for t in state["traits"] if t["key"] == "race"][0]
        assert race_trait["values"] == ["elf"]

    def test_no_trait_defs_shows_local_ids(self):
        data = make_char_data(traits={"race": ["addon1.human"]})
        state = build_character_state(data, make_template(), {})
        race_trait = [t for t in state["traits"] if t["key"] == "race"][0]
        assert race_trait["values"] == ["human"]


# ---------------------------------------------------------------------------
# build_character_state — abilities
# ---------------------------------------------------------------------------


class TestBuildCharacterStateAbilities:
    def test_abilities_from_trait_defs(self):
        trait_defs = {
            "addon1.technique": {
                "id": "addon1.technique",
                "name": "技巧",
                "category": "ability",
                "defaultValue": 0,
            },
        }
        data = make_char_data(abilities={"addon1.technique": 3000})
        state = build_character_state(data, make_template(), {}, trait_defs=trait_defs)
        assert len(state["abilities"]) == 1
        ab = state["abilities"][0]
        assert ab["key"] == "addon1.technique"
        assert ab["label"] == "技巧"
        assert ab["exp"] == 3000
        assert ab["grade"] == "D"

    def test_abilities_default_exp(self):
        trait_defs = {
            "addon1.technique": {
                "id": "addon1.technique",
                "name": "技巧",
                "category": "ability",
                "defaultValue": 0,
            },
        }
        data = make_char_data(abilities={})
        state = build_character_state(data, make_template(), {}, trait_defs=trait_defs)
        ab = state["abilities"][0]
        assert ab["exp"] == 0
        assert ab["grade"] == "G"

    def test_no_trait_defs_uses_template_abilities(self):
        tpl = make_template(
            abilities=[
                {"key": "technique", "label": "技巧", "defaultValue": 0},
            ]
        )
        data = make_char_data(abilities={"technique": 5000})
        state = build_character_state(data, tpl, {})
        ab = state["abilities"][0]
        assert ab["exp"] == 5000
        assert ab["grade"] == "B"


# ---------------------------------------------------------------------------
# build_character_state — experiences
# ---------------------------------------------------------------------------


class TestBuildCharacterStateExperiences:
    def test_experiences_from_trait_defs(self):
        trait_defs = {
            "addon1.kiss": {
                "id": "addon1.kiss",
                "name": "接吻经验",
                "category": "experience",
            },
        }
        data = make_char_data(experiences={"addon1.kiss": {"count": 5, "first": "Bob"}})
        state = build_character_state(data, make_template(), {}, trait_defs=trait_defs)
        assert len(state["experiences"]) == 1
        exp = state["experiences"][0]
        assert exp["key"] == "addon1.kiss"
        assert exp["label"] == "接吻经验"
        assert exp["count"] == 5
        assert exp["first"] == "Bob"

    def test_missing_experience_data_defaults(self):
        trait_defs = {
            "addon1.kiss": {
                "id": "addon1.kiss",
                "name": "接吻经验",
                "category": "experience",
            },
        }
        data = make_char_data(experiences={})
        state = build_character_state(data, make_template(), {}, trait_defs=trait_defs)
        exp = state["experiences"][0]
        assert exp["count"] == 0
        assert exp["first"] is None


# ---------------------------------------------------------------------------
# build_character_state — inventory
# ---------------------------------------------------------------------------


class TestBuildCharacterStateInventory:
    def test_inventory_resolves_item_names(self):
        item_defs = {
            "addon1.bread": {"name": "面包", "tags": ["food"]},
        }
        data = make_char_data(inventory=[{"itemId": "addon1.bread", "amount": 3}])
        state = build_character_state(data, make_template(), {}, item_defs=item_defs)
        assert len(state["inventory"]) == 1
        inv = state["inventory"][0]
        assert inv["itemId"] == "addon1.bread"
        assert inv["name"] == "面包"
        assert inv["tags"] == ["food"]
        assert inv["amount"] == 3

    def test_missing_item_def_shows_local_id(self):
        data = make_char_data(inventory=[{"itemId": "addon1.unknown", "amount": 1}])
        state = build_character_state(data, make_template(), {})
        inv = state["inventory"][0]
        assert inv["name"] == "unknown"
        assert inv["tags"] == []

    def test_amount_defaults_to_one(self):
        data = make_char_data(inventory=[{"itemId": "addon1.bread"}])
        state = build_character_state(data, make_template(), {})
        assert state["inventory"][0]["amount"] == 1


# ---------------------------------------------------------------------------
# build_character_state — position
# ---------------------------------------------------------------------------


class TestBuildCharacterStatePosition:
    def test_position_from_char_data(self):
        state = build_character_state(make_char_data(), make_template(), {})
        assert state["position"] == {"mapId": "map1", "cellId": 1}
        assert state["restPosition"] == {"mapId": "map1", "cellId": 0}

    def test_position_defaults_when_missing(self):
        data = make_char_data()
        del data["position"]
        del data["restPosition"]
        state = build_character_state(data, make_template(), {})
        assert state["position"] == {"mapId": "", "cellId": 0}
        assert state["restPosition"] == {"mapId": "", "cellId": 0}


# ---------------------------------------------------------------------------
# build_character_state — favorability
# ---------------------------------------------------------------------------


class TestBuildCharacterStateFavorability:
    def test_favorability_passed_through(self):
        data = make_char_data(favorability={"addon1.bob": 200})
        state = build_character_state(data, make_template(), {})
        assert state["favorability"] == {"addon1.bob": 200}

    def test_favorability_defaults_empty(self):
        data = make_char_data()
        del data["favorability"]
        state = build_character_state(data, make_template(), {})
        assert state["favorability"] == {}


# ---------------------------------------------------------------------------
# build_character_state — trait effects applied
# ---------------------------------------------------------------------------


class TestBuildCharacterStateTraitEffects:
    def test_trait_effect_modifies_resource_max(self):
        trait_defs = {
            "addon1.strong": {
                "id": "addon1.strong",
                "name": "强壮",
                "category": "race",
                "effects": [
                    {
                        "target": "stamina",
                        "effect": "increase",
                        "magnitudeType": "fixed",
                        "value": 100,
                    },
                ],
            },
        }
        data = make_char_data(traits={"race": ["addon1.strong"]})
        state = build_character_state(data, make_template(), {}, trait_defs=trait_defs)
        # stamina max should be 2000 + 100 = 2100
        assert state["resources"]["stamina"]["max"] == 2100


# ---------------------------------------------------------------------------
# build_character_state — clothing effects applied
# ---------------------------------------------------------------------------


class TestBuildCharacterStateClothingEffects:
    def test_clothing_effect_on_worn_item(self):
        clothing_defs = {
            "addon1.boots": {
                "name": "强力靴",
                "occlusion": [],
                "effects": [
                    {
                        "target": "stamina",
                        "effect": "increase",
                        "magnitudeType": "fixed",
                        "value": 50,
                    },
                ],
            },
        }
        data = make_char_data(
            clothing={"feet": {"itemId": "addon1.boots", "state": "worn"}},
        )
        state = build_character_state(data, make_template(), clothing_defs)
        assert state["resources"]["stamina"]["max"] == 2050
