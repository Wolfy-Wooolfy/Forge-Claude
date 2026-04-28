const CodexProvider = require("./codexProvider");

class ProviderRouter {
  constructor(config = {}) {
    this.config = config;

    this.providers = {
      codex: new CodexProvider(config.codex || {})
    };

    this.defaultProvider = "codex";
  }

  getProvider(name) {
    if (!name) {
      return this.providers[this.defaultProvider];
    }

    const provider = this.providers[name];

    if (!provider) {
      throw new Error(`Provider not found: ${name}`);
    }

    return provider;
  }

  async execute(task, options = {}) {
    const providerName = options.provider || this.defaultProvider;

    const provider = this.getProvider(providerName);

    return await provider.executeTask(task);
  }
}

module.exports = ProviderRouter;