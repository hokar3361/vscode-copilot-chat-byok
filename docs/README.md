# VSCode Copilot Chat BYOK Documentation

This directory contains comprehensive documentation for the BYOK (Bring Your Own Key) system in VSCode Copilot Chat.

## Documents

### [BYOK Agent Mode Technical Specification](./BYOK_AGENT_MODE_TECHNICAL_SPEC.md)

Complete technical specification documenting the existing BYOK implementation that supports multiple AI models in agent mode.

**Covers:**
- Architecture overview and component design
- Supported AI providers (Anthropic, OpenAI, Gemini, Azure, etc.)
- Agent mode integration and tool calling
- Model registration and management workflows
- API key security and storage
- User interface flows
- Extension points for new providers
- Performance optimization and error handling

## Quick Start

### Using BYOK Models in Agent Mode

1. **Enable BYOK**: Ensure you have a valid Copilot subscription (Individual or GitHub Enterprise)
2. **Access Model Management**: 
   - Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
   - Run: `GitHub Copilot Chat: Manage Models`
3. **Add Provider**: Select from available providers (Anthropic, OpenAI, Gemini, etc.)
4. **Configure API Key**: Enter your provider's API key
5. **Select Models**: Choose which models to enable
6. **Use in Agent Mode**: Models with tool calling support automatically work in agent mode

### Supported Providers

| Provider | Models | Agent Mode | Auth Type |
|----------|--------|------------|-----------|
| Anthropic | Claude-3.5-sonnet, Claude-3-opus | ✅ | Global API Key |
| OpenAI | GPT-4, GPT-4-turbo | ✅ | Global API Key |
| Google | Gemini-1.5-pro | ✅ | Global API Key |
| Azure | Custom deployments | ✅ | Per-Model (URL + Key) |
| Groq | Llama-3.1, Mixtral | ✅ | Global API Key |
| Ollama | Local models | ✅ | No Auth Required |

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    VSCode Extension                         │
├─────────────────────────────────────────────────────────────┤
│  Agent Mode (AgentIntent)                                   │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ • Tool Calling (EditFile, RunInTerminal, etc.)         │ │
│  │ • Multi-step workflows                                 │ │
│  │ • Context management                                   │ │
│  └─────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│  BYOK System                                                │
│  ┌──────────────────┐ ┌──────────────────┐ ┌─────────────┐ │
│  │ Model Registry   │ │ UI Service       │ │ Storage     │ │
│  │ • Provider APIs  │ │ • Configuration  │ │ • API Keys  │ │
│  │ • Capabilities   │ │ • Model Selection│ │ • Settings  │ │
│  └──────────────────┘ └──────────────────┘ └─────────────┘ │
├─────────────────────────────────────────────────────────────┤
│  AI Providers                                               │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌───────┐ │
│  │Anthropic│ │ OpenAI  │ │ Gemini  │ │ Azure   │ │ ...   │ │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └───────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Development

### Adding a New Provider

1. **Create Provider Registry**: Implement `BYOKModelRegistry` interface
2. **Create Chat Provider**: Implement `LanguageModelChatProvider` interface  
3. **Register in System**: Add to `BYOKContrib` registry list
4. **Add UI Support**: Update model management interface

### Key Interfaces

```typescript
// Core provider interface
interface BYOKModelRegistry {
    readonly name: string;
    readonly authType: BYOKAuthType;
    getAllModels(apiKey?: string): Promise<{ id: string; name: string }[]>;
    registerModel(config: BYOKModelConfig): Promise<Disposable>;
}

// Model configuration
interface BYOKModelConfig {
    modelId: string;
    apiKey?: string;
    deploymentUrl?: string;
    capabilities?: BYOKModelCapabilities;
}
```

## Security

- **API Key Encryption**: All keys stored in VS Code's secure storage
- **Memory Protection**: Keys cleared after use, never logged
- **Transport Security**: HTTPS only for all communications
- **Scope Isolation**: Keys scoped to specific providers/models

## Contributing

1. Review the [technical specification](./BYOK_AGENT_MODE_TECHNICAL_SPEC.md)
2. Follow established patterns for new providers
3. Ensure comprehensive error handling
4. Add tests for new functionality
5. Update documentation

## Support

For issues and questions:
- Check the troubleshooting section in the technical specification
- Review VS Code extension logs
- Verify API key validity and permissions
- Ensure model supports required capabilities (tool calling for agent mode)