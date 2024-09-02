/**
 * A test to figure out how to calculate the power flow in a set of nodes and edges.
 *
 * Contraints:
 * - We know the net flow at each node
 * - We know the capacity on each edge
 *
 * Objective:
 * - Figure out the flow on each edge
 */

import {
  JapanTsoName,
  INTERCONNECTOR_DETAILS,
  JapanInterconnectors,
} from "./const";
import { JapanInterconnectorDetails } from "./types";

// Real example
const nodesReal = [
  {
    name: JapanTsoName.HEPCO,
    netFlow: 406,
  },
  {
    name: JapanTsoName.TOHOKU,
    netFlow: 2273,
  },
  {
    name: JapanTsoName.TEPCO,
    netFlow: -2763.5,
  },
  {
    name: JapanTsoName.CHUBU,
    netFlow: -1708,
  },
  {
    name: JapanTsoName.HOKUDEN,
    netFlow: -516,
  },
  {
    name: JapanTsoName.KEPCO,
    netFlow: -469,
  },
  {
    name: JapanTsoName.CHUGOKU,
    netFlow: -3,
  },
  {
    name: JapanTsoName.YONDEN,
    netFlow: 1440,
  },
  {
    name: JapanTsoName.KYUDEN,
    netFlow: 1716,
  },
];

function calculateInterconnectorFlows(
  nodes: { name: JapanTsoName; netFlow: number }[],
  interconnectors: typeof INTERCONNECTOR_DETAILS
): { from: JapanTsoName; to: JapanTsoName; flow: number; capacity: number }[] {
  const nodeMap = new Map(
    nodes.map((node) => [node.name, { ...node, remainingFlow: node.netFlow }])
  );
  const interconnectorsWithFlow = Object.entries(interconnectors).map(
    ([key, details]) => ({
      from: details.pair[0],
      to: details.pair[1],
      capacity: details.capacityMW,
      flow: 0,
    })
  );

  // Function to find all possible paths between two nodes
  function findPaths(
    start: JapanTsoName,
    end: JapanTsoName,
    visited = new Set<JapanTsoName>()
  ): JapanTsoName[][] {
    if (start === end) return [[start]];
    visited.add(start);
    const paths: JapanTsoName[][] = [];
    for (const interconnector of interconnectorsWithFlow) {
      if (
        (interconnector.from === start && !visited.has(interconnector.to)) ||
        (interconnector.to === start && !visited.has(interconnector.from))
      ) {
        const nextNode =
          interconnector.from === start
            ? interconnector.to
            : interconnector.from;
        const subPaths = findPaths(nextNode, end, new Set(visited));
        for (const subPath of subPaths) {
          paths.push([start, ...subPath]);
        }
      }
    }
    return paths;
  }

  // Function to distribute flow along a path
  function distributeFlow(path: JapanTsoName[], flow: number) {
    for (let i = 0; i < path.length - 1; i++) {
      const interconnector = interconnectorsWithFlow.find(
        (ic) =>
          (ic.from === path[i] && ic.to === path[i + 1]) ||
          (ic.from === path[i + 1] && ic.to === path[i])
      );
      if (interconnector) {
        if (interconnector.from === path[i]) {
          interconnector.flow += flow;
        } else {
          interconnector.flow -= flow;
        }
        nodeMap.get(path[i])!.remainingFlow -= flow;
        nodeMap.get(path[i + 1])!.remainingFlow += flow;
      }
    }
  }

  // Sort nodes by absolute net flow, descending order
  const sortedNodes = [...nodeMap.values()].sort(
    (a, b) => Math.abs(b.netFlow) - Math.abs(a.netFlow)
  );

  for (const fromNode of sortedNodes) {
    if (fromNode.remainingFlow <= 0) continue;

    for (const toNode of sortedNodes) {
      if (toNode.remainingFlow >= 0) continue;

      const paths = findPaths(fromNode.name, toNode.name);
      console.log(fromNode.name, toNode.name, paths);
      for (const path of paths) {
        const maxFlow = Math.min(
          fromNode.remainingFlow,
          -toNode.remainingFlow,
          ...path.slice(0, -1).map((node, i) => {
            const interconnector = interconnectorsWithFlow.find(
              (ic) =>
                (ic.from === node && ic.to === path[i + 1]) ||
                (ic.from === path[i + 1] && ic.to === node)
            );
            return interconnector
              ? interconnector.capacity - Math.abs(interconnector.flow)
              : 0;
          })
        );

        if (maxFlow > 0) {
          distributeFlow(path, maxFlow);
        }

        if (fromNode.remainingFlow === 0) break;
      }

      if (fromNode.remainingFlow === 0) break;
    }
  }

  return interconnectorsWithFlow;
}

const flows = calculateInterconnectorFlows(nodesReal, INTERCONNECTOR_DETAILS);
console.log(flows);

// console.log("Real Edge Flows:");
// for (const edge of interconnectorFlows) {
//   console.log(`${edge.from} -> ${edge.to}: ${edge.flow} / ${edge.capacity}`);
// }

// // Check remaining node flows after edge flows are assigned
// console.log("\nReal Remaining Node Flows:");
// for (const node of nodesReal) {
//   let remainingFlow = node.netFlow;
//   for (const edge of interconnectorFlows) {
//     if (edge.from === node.name) {
//       remainingFlow -= edge.flow;
//     } else if (edge.to === node.name) {
//       remainingFlow += edge.flow;
//     }
//   }
//   console.log(`${node.name}: ${remainingFlow.toFixed(2)}`);
// }
