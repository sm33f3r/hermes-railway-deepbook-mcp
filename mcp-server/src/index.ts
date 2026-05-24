/**
 * DeepBook MCP Server entry point.
 * Phase 2: Wire market data tools and DeepBook client.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { initClient } from './client.js';
import { marketDataTools, marketDataHandlers } from './tools/market-data.js';
import { config } from './config.js';

async function main() {
  try {
    const client = await initClient();

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
        tools: marketDataTools,
      };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const handler = marketDataHandlers[request.params.name];
      if (!handler) {
        throw new Error(`Unknown tool: ${request.params.name}`);
      }
      return handler(request.params.arguments ?? {}, client);
    });

    const transport = new StdioServerTransport();
    await server.connect(transport);

    process.stderr.write(`[deepbook-mcp] Server ready. Network: ${config.network}\n`);
    process.stderr.write(`[deepbook-mcp] Tools registered: ${marketDataTools.length}\n`);
  } catch (error) {
    process.stderr.write(`[deepbook-mcp] Fatal: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

main();