"""Real observed representation shapes with synthetic content, never reasoning."""
import json
from pathlib import Path
import pytest
from agenttree.core.structured_output import normalize_decision_output
from agenttree.exceptions import DecisionOutputError

CORPUS = json.loads((Path(__file__).parent / "fixtures/model-response-shapes.json").read_text())


@pytest.mark.parametrize("entry", CORPUS, ids=[f"{row['provider']}-{row['source_index']}" for row in CORPUS])
def test_observed_shape_corpus(entry):
    if not entry["expected_parse"]:
        with pytest.raises(DecisionOutputError):
            normalize_decision_output(entry["example_final_content"])
    else:
        value, representation = normalize_decision_output(entry["example_final_content"])
        assert isinstance(value, dict)
        assert representation == entry["representation"]
