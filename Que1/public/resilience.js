class StateGuardianCircuit {
  constructor(options = {}) {
    this.maxAttempts = options.maxAttempts || 5;
    this.baseDelayMs = options.baseDelayMs || 100;
    this.maxDelayMs = options.maxDelayMs || 1600;
    this.failures = 0;
    this.open = false;
  }

  delay(attempt) {
    const exponential = Math.min(this.maxDelayMs, this.baseDelayMs * (2 ** attempt));
    return Math.min(this.maxDelayMs, exponential + Math.floor(Math.random() * 25));
  }

  async run(operation, isReady) {
    if (this.open) throw new Error('Circuit breaker is open');
    for (let attempt = 0; attempt < this.maxAttempts; attempt += 1) {
      try {
        await operation();
        if (isReady()) {
          this.failures = 0;
          return true;
        }
        this.failures += 1;
      } catch (error) {
        this.failures += 1;
      }
      await new Promise(resolve => setTimeout(resolve, this.delay(attempt)));
      if (this.failures >= this.maxAttempts) this.open = true;
    }
    return false;
  }
}
