const KEY = 'deepdive.discovered.v1';

export class Progress {
  private found = new Set<string>();

  constructor() {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved) this.found = new Set(JSON.parse(saved) as string[]);
    } catch {
      /* storage blocked or corrupt: start fresh */
    }
  }

  has(id: string): boolean {
    return this.found.has(id);
  }

  /** Returns true if the id was newly discovered. */
  add(id: string): boolean {
    if (this.found.has(id)) return false;
    this.found.add(id);
    this.save();
    return true;
  }

  list(): string[] {
    return [...this.found];
  }

  reset(): void {
    this.found.clear();
    this.save();
  }

  private save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify([...this.found]));
    } catch {
      /* storage blocked: progress lasts for this session only */
    }
  }
}
