/** Хранилище не принимает URL запросов: на диск попадают только данные без подписи и пароля. */
export class AccountRepository {
  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'>, private readonly account: string) {}

  read<T>(kind: string): T | undefined {
    try {
      const raw = this.storage.getItem(this.key(kind))
      if (!raw) return
      const envelope = JSON.parse(raw) as { account: string; data: T }
      return envelope.account === this.account ? envelope.data : undefined
    } catch { return undefined }
  }

  write<T>(kind: string, data: T): boolean {
    try {
      this.storage.setItem(this.key(kind), JSON.stringify({ account: this.account, data }))
      return true
    } catch { return false }
  }

  private key(kind: string) { return `nocturne.v2.${kind}.${encodeURIComponent(this.account)}` }
}

/** Ответ старого подключения не имеет права менять новое, даже если URL сервера совпал. */
export class SessionEpoch {
  private version = 0
  next() { return ++this.version }
  capture() { const version = this.version; return () => version === this.version }
}
