const { Graph } = require("graphlib");
const solver = require("javascript-lp-solver");

class EnergyNetwork {
  constructor() {
    this.nodes = new Map();
    this.edges = new Map();
  }

  addNode(node, netFlow) {
    this.nodes.set(node, { netFlow, remainingFlow: netFlow });
  }

  addEdge(from, to, capacity) {
    const edgeKey = `${from}->${to}`;
    this.edges.set(edgeKey, { from, to, capacity, flow: 0 });
  }

  balanceFlows() {
    const exportingNodes = [...this.nodes.entries()]
      .filter(([_, { netFlow }]) => netFlow > 0)
      .sort((a, b) => b[1].netFlow - a[1].netFlow);

    const importingNodes = [...this.nodes.entries()]
      .filter(([_, { netFlow }]) => netFlow < 0)
      .sort((a, b) => a[1].netFlow - b[1].netFlow);

    for (const [exportNode, exportData] of exportingNodes) {
      for (const [importNode, importData] of importingNodes) {
        if (exportData.remainingFlow <= 0) break;
        if (importData.remainingFlow >= 0) continue;

        const possiblePaths = this.findAllPaths(exportNode, importNode);
        for (const path of possiblePaths) {
          const maxFlow = this.getMaxFlowAlongPath(path);
          const flowToTransfer = Math.min(
            maxFlow,
            exportData.remainingFlow,
            -importData.remainingFlow
          );

          if (flowToTransfer > 0) {
            this.transferFlowAlongPath(path, flowToTransfer);
            exportData.remainingFlow -= flowToTransfer;
            importData.remainingFlow += flowToTransfer;
            if (exportData.remainingFlow <= 0 || importData.remainingFlow >= 0)
              break;
          }
        }
      }
    }
  }

  findAllPaths(start, end, path = [], visited = new Set()) {
    path.push(start);
    visited.add(start);

    if (start === end) {
      return [path];
    }

    const paths = [];
    for (const [edgeKey, edge] of this.edges) {
      if (edge.from === start && !visited.has(edge.to)) {
        const newPaths = this.findAllPaths(
          edge.to,
          end,
          [...path],
          new Set(visited)
        );
        paths.push(...newPaths);
      }
    }

    return paths;
  }

  getMaxFlowAlongPath(path) {
    let maxFlow = Infinity;
    for (let i = 0; i < path.length - 1; i++) {
      const edgeKey = `${path[i]}->${path[i + 1]}`;
      const edge = this.edges.get(edgeKey);
      maxFlow = Math.min(maxFlow, edge.capacity - edge.flow);
    }
    return maxFlow;
  }

  transferFlowAlongPath(path, flow) {
    for (let i = 0; i < path.length - 1; i++) {
      const edgeKey = `${path[i]}->${path[i + 1]}`;
      const edge = this.edges.get(edgeKey);
      edge.flow += flow;
    }
  }

  getEdgeFlows() {
    const flows = {};
    for (const [edgeKey, edge] of this.edges) {
      flows[edgeKey] = edge.flow;
    }
    return flows;
  }

  getNodeFlows() {
    const flows = {};
    for (const [node, data] of this.nodes) {
      flows[node] = data.netFlow - data.remainingFlow;
    }
    return flows;
  }
}

const network = new EnergyNetwork();

// Add nodes (name, netFlow) - positive for export, negative for import
network.addNode("A", 100); // Exporting 100 units
network.addNode("B", -40); // Importing 40 units
network.addNode("C", -80); // Importing 80 units
network.addNode("D", 20); // Exporting 20 units

// Add edges (from, to, capacity)
network.addEdge("A", "B", 50);
network.addEdge("A", "D", 60);
network.addEdge("D", "C", 80);
network.addEdge("B", "C", 10);

try {
  // Balance the flows
  const totalFlow = network.balanceFlows();

  console.log("Total flow:", totalFlow);
  console.log("Edge flows:", network.getEdgeFlows());
  console.log("Node flows:", network.getNodeFlows());
} catch (error) {
  console.error("Error:", error.message);
}
