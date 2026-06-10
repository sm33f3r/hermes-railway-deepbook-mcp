/**
 * DeepBook MCP Server entry point.
* Phase 3: Wire market data, indicator, account, and order tools.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { initClient } from './client.js';
import { marketDataTools, marketDataHandlers } from './tools/market-data.js';
import { indicatorTools, indicatorHandlers } from './tools/indicators.js';
import { config } from './config.js';
import { accountTools, accountHandlers } from './tools/account.js';
import { orderTools, orderHandlers } from './tools/orders.js';
import { swapTools, swapHandlers } from './tools/swaps.js';
import { flashLoanTools, flashLoanHandlers } from './tools/flashLoans.js';
import { marginAccountTools, marginAccountHandlers } from './tools/marginAccount.js';
import { conditionalOrderTools, conditionalOrderHandlers } from './tools/conditionalOrders.js';

async function main() {
  try {
    const state = await initClient();
    const { client } = state;

    const server = new Server(
      {
        name: 'deepbook-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [...marketDataTools, ...indicatorTools, ...accountTools, ...orderTools, ...swapTools, ...flashLoanTools, ...marginAccountTools, ...conditionalOrderTools],
      };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const handler = { ...marketDataHandlers, ...indicatorHandlers, ...accountHandlers, ...orderHandlers, ...swapHandlers, ...flashLoanHandlers, ...marginAccountHandlers, ...conditionalOrderHandlers }[request.params.name];
      if (!handler) {
        throw new Error(`Unknown tool: ${request.params.name}`);
      }
      return handler(request.params.arguments ?? {}, state);
    });

    const transport = new StdioServerTransport();
    await server.connect(transport);

    process.stderr.write(`[deepbook-mcp] Server ready. Network: ${config.network}\n`);
    process.stderr.write(`[deepbook-mcp] Tools registered: ${marketDataTools.length + indicatorTools.length + accountTools.length + orderTools.length + swapTools.length + flashLoanTools.length + marginAccountTools.length + conditionalOrderTools.length}\n`);
  } catch (error) {
    process.stderr.write(`[deepbook-mcp] Fatal: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

main();