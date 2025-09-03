export interface IService {
    name: string
    init(): void
    check(callsign: string, hex: string): Promise<Record<string, any>>
}
