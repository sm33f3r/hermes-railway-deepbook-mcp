import { Server } from '@modelcontextprotocol/sdk/server';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// Create MCP server
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

// Handle ListTools request - return empty array for now
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [],
  };
});

// Handle CallTool request - return error since no tools implemented
server.setRequestHandler(CallToolRequestSchema, async () => {
  throw new Error('No tools implemented yet');
});

// Start server
async function main() {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    process.stderr.write('[deepbook-mcp] Server ready\n');
  } catch (error) {
    process.stderr.write(`Fatal error: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

main();