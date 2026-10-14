import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { RekognitionService } from '../services/rekognitionService'

const server = new Server(
  {
    name: 'workbench-aws-rekognition',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
)

const rekognition = RekognitionService.getInstance()

// Define MCP tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'rekognition_add_face',
        description: 'Indexes and registers a face from a local image file into an Amazon Rekognition collection for future verification and identification.',
        inputSchema: {
          type: 'object',
          properties: {
            imagePath: {
              type: 'string',
              description: 'Absolute or relative path to the image file (.jpg, .jpeg, .png, .webp).',
            },
            personName: {
              type: 'string',
              description: 'Name or identifier of the person to associate with this face (e.g. "John Doe").',
            },
            collectionId: {
              type: 'string',
              description: 'Collection ID to store the face vector into (default: "workbench-faces").',
            },
          },
          required: ['imagePath'],
        },
      },
      {
        name: 'rekognition_check_face',
        description: 'Searches and verifies a face in a query image against an Amazon Rekognition collection, returning matching people and similarity scores.',
        inputSchema: {
          type: 'object',
          properties: {
            imagePath: {
              type: 'string',
              description: 'Absolute or relative path to the query image file (.jpg, .jpeg, .png, .webp).',
            },
            collectionId: {
              type: 'string',
              description: 'Collection ID to search against (default: "workbench-faces").',
            },
            matchThreshold: {
              type: 'number',
              description: 'Minimum match confidence threshold (50 to 99, default: 85).',
            },
          },
          required: ['imagePath'],
        },
      },
      {
        name: 'rekognition_list_faces',
        description: 'Lists all indexed faces in an Amazon Rekognition collection.',
        inputSchema: {
          type: 'object',
          properties: {
            collectionId: {
              type: 'string',
              description: 'Collection ID to list faces from (default: "workbench-faces").',
            },
          },
        },
      },
      {
        name: 'rekognition_detect_labels',
        description: 'Identifies objects, scenes, concepts, and activities in an image.',
        inputSchema: {
          type: 'object',
          properties: {
            imagePath: {
              type: 'string',
              description: 'Path to the image file.',
            },
            maxLabels: {
              type: 'number',
              description: 'Maximum number of labels to return (default: 20).',
            },
            minConfidence: {
              type: 'number',
              description: 'Minimum confidence score (default: 70).',
            },
          },
          required: ['imagePath'],
        },
      },
      {
        name: 'rekognition_detect_text',
        description: 'Performs OCR to detect and extract printed and handwritten text from an image or diagram.',
        inputSchema: {
          type: 'object',
          properties: {
            imagePath: {
              type: 'string',
              description: 'Path to the image file.',
            },
          },
          required: ['imagePath'],
        },
      },
    ],
  }
})

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params
  const safeArgs: any = args || {}

  try {
    switch (name) {
      case 'rekognition_add_face': {
        const result = await rekognition.addFace({
          imagePath: safeArgs.imagePath,
          personName: safeArgs.personName,
          collectionId: safeArgs.collectionId,
        })
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        }
      }

      case 'rekognition_check_face': {
        const result = await rekognition.checkFace({
          imagePath: safeArgs.imagePath,
          collectionId: safeArgs.collectionId,
          matchThreshold: safeArgs.matchThreshold,
        })
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        }
      }

      case 'rekognition_list_faces': {
        const result = await rekognition.listFaces(safeArgs.collectionId)
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        }
      }

      case 'rekognition_detect_labels': {
        const result = await rekognition.detectLabels(
          safeArgs.imagePath,
          safeArgs.maxLabels,
          safeArgs.minConfidence
        )
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        }
      }

      case 'rekognition_detect_text': {
        const result = await rekognition.detectText(safeArgs.imagePath)
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        }
      }

      default:
        throw new Error(`Unknown tool: ${name}`)
    }
  } catch (err: any) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `Error executing ${name}: ${err?.message || String(err)}`,
        },
      ],
    }
  }
})

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('[Rekognition MCP Server] Running on stdio')
}

main().catch((err) => {
  console.error('[Rekognition MCP Server] Fatal startup error:', err)
  process.exit(1)
})
