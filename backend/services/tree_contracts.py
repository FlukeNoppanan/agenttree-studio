"""Shared deterministic contracts for persisted and unsaved Tree versions."""

from collections.abc import Iterable


def invalid_manager_peers(agents: Iterable) -> tuple[str, ...]:
    """Return Manager IDs with invalid directed peer references.

    References belong to this exact version, never a prior version with the
    same display names. Configuration is rejected rather than silently repaired.
    """
    managers = [agent for agent in agents if agent.agent_type == "manager"]
    manager_ids = {agent.id for agent in managers}
    invalid = []
    for manager in managers:
        peers = (manager.settings_json or {}).get("allowed_manager_peer_ids", [])
        if (not isinstance(peers, list)
                or any(not isinstance(peer, str) or peer == manager.id
                       or peer not in manager_ids for peer in peers)
                or len(set(peers)) != len(peers)):
            invalid.append(manager.id)
    return tuple(invalid)
