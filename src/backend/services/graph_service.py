# GraphIQ - graph_service.py
# Exports the full Neo4j graph in Cytoscape.js-compatible JSON format.

import logging
from src.backend.services.neo4j_service import run_query

logger = logging.getLogger(__name__)

NODE_COLORS = {
    "Customer":        "#4A90D9",
    "SalesOrder":      "#7ED321",
    "Delivery":        "#F5A623",
    "BillingDocument": "#D0021B",
    "Payment":         "#9B59B6",
    "JournalEntry":    "#1ABC9C",
    "Product":         "#E67E22",
    "Plant":           "#95A5A6",
}


def get_full_graph() -> dict:
    """Query all nodes and relationships from Neo4j and format as Cytoscape.js JSON.

    Returns:
        A dict with "nodes" and "edges" lists in Cytoscape.js format.
    """
    nodes = []
    edges = []

    # --- Fetch all nodes ---
    node_query = """
    MATCH (n)
    RETURN elementId(n) AS neo4j_id,
           labels(n) AS labels,
           properties(n) AS props
    """
    try:
        node_results = run_query(node_query)
    except Exception as e:
        logger.error(f"Failed to fetch nodes: {e}")
        return {"nodes": [], "edges": []}

    for row in node_results:
        label = row["labels"][0] if row["labels"] else "Unknown"
        props = row["props"]
        node_id = f"{label}_{props.get('id', row['neo4j_id'])}"

        display_name = (
            props.get("fullName")
            or props.get("name")
            or props.get("id")
            or str(row["neo4j_id"])
        )

        nodes.append({
            "data": {
                "id": node_id,
                "label": label,
                "displayName": display_name,
                "color": NODE_COLORS.get(label, "#CCCCCC"),
                "properties": props,
            }
        })

    # --- Fetch all relationships ---
    rel_query = """
    MATCH (a)-[r]->(b)
    RETURN elementId(r) AS rel_id,
           type(r) AS rel_type,
           labels(a)[0] AS source_label,
           properties(a).id AS source_id,
           elementId(a) AS source_neo4j_id,
           labels(b)[0] AS target_label,
           properties(b).id AS target_id,
           elementId(b) AS target_neo4j_id
    """
    try:
        rel_results = run_query(rel_query)
    except Exception as e:
        logger.error(f"Failed to fetch relationships: {e}")
        return {"nodes": nodes, "edges": []}

    for row in rel_results:
        source_label = row["source_label"] or "Unknown"
        target_label = row["target_label"] or "Unknown"
        source_id = f"{source_label}_{row.get('source_id') or row['source_neo4j_id']}"
        target_id = f"{target_label}_{row.get('target_id') or row['target_neo4j_id']}"

        edges.append({
            "data": {
                "id": f"rel_{row['rel_id']}",
                "source": source_id,
                "target": target_id,
                "label": row["rel_type"],
            }
        })

    logger.info(f"Graph export: {len(nodes)} nodes, {len(edges)} edges")
    return {"nodes": nodes, "edges": edges}


def get_node_with_neighbors(node_id: str) -> dict:
    """Fetch a single node and all of its direct neighbors.

    Args:
        node_id: The id property of the node (e.g., '740506').

    Returns:
        A dict with "nodes" and "edges" for the subgraph.
    """
    nodes = []
    edges = []

    query = """
    MATCH (n)
    WHERE n.id = $node_id
    OPTIONAL MATCH (n)-[r]-(m)
    RETURN elementId(n) AS n_id,
           labels(n) AS n_labels,
           properties(n) AS n_props,
           elementId(r) AS r_id,
           type(r) AS r_type,
           startNode(r) = n AS is_outgoing,
           elementId(m) AS m_id,
           labels(m) AS m_labels,
           properties(m) AS m_props
    """
    try:
        results = run_query(query, {"node_id": node_id})
    except Exception as e:
        logger.error(f"Failed to fetch node neighbors: {e}")
        return {"nodes": [], "edges": []}

    seen_nodes = set()

    for row in results:
        # Center node
        n_label = row["n_labels"][0] if row["n_labels"] else "Unknown"
        n_cyto_id = f"{n_label}_{row['n_props'].get('id', row['n_id'])}"
        if n_cyto_id not in seen_nodes:
            seen_nodes.add(n_cyto_id)
            nodes.append({
                "data": {
                    "id": n_cyto_id,
                    "label": n_label,
                    "displayName": row["n_props"].get("fullName") or row["n_props"].get("name") or row["n_props"].get("id", ""),
                    "color": NODE_COLORS.get(n_label, "#CCCCCC"),
                    "properties": row["n_props"],
                }
            })

        # Neighbor node
        if row.get("m_id") is not None and row.get("m_id") != "":
            m_label = row["m_labels"][0] if row["m_labels"] else "Unknown"
            m_cyto_id = f"{m_label}_{row['m_props'].get('id', row['m_id'])}"
            if m_cyto_id not in seen_nodes:
                seen_nodes.add(m_cyto_id)
                nodes.append({
                    "data": {
                        "id": m_cyto_id,
                        "label": m_label,
                        "displayName": row["m_props"].get("fullName") or row["m_props"].get("name") or row["m_props"].get("id", ""),
                        "color": NODE_COLORS.get(m_label, "#CCCCCC"),
                        "properties": row["m_props"],
                    }
                })

            # Edge
            if row.get("r_id") is not None and row.get("r_id") != "":
                if row.get("is_outgoing"):
                    source, target = n_cyto_id, m_cyto_id
                else:
                    source, target = m_cyto_id, n_cyto_id

                edges.append({
                    "data": {
                        "id": f"rel_{row['r_id']}",
                        "source": source,
                        "target": target,
                        "label": row["r_type"],
                    }
                })

    logger.info(f"Node subgraph for '{node_id}': {len(nodes)} nodes, {len(edges)} edges")
    return {"nodes": nodes, "edges": edges}
