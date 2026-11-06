import { StringDecoder } from 'string_decoder';
import { jsonrepair } from 'jsonrepair';
import Logger from './logger';

type JsonObject = Record<string, any>;

const MAX_BUFFER_CHARS = 1_000_000;

/**
 * Line-buffered NDJSON parser for the TCP feed.
 *
 * TCP chunks do not line up with message boundaries: one chunk can hold several
 * lines, or end part-way through a line. Complete lines are parsed and returned,
 * and a trailing partial line is held until the next chunk completes it.
 */
export class NdjsonParser {
    private buffer = '';
    // Holds back an incomplete multi-byte character until its remaining bytes arrive
    private decoder = new StringDecoder('utf8');

    push(chunk: Buffer | string): JsonObject[] {
        this.buffer += typeof chunk === 'string' ? chunk : this.decoder.write(chunk);

        const lines = this.buffer.split('\n');
        // Everything after the last newline is a (possibly empty) partial line
        this.buffer = lines.pop() ?? '';

        const results: JsonObject[] = [];
        for (const line of lines) {
            this.parseLine(line, results);
        }

        // A feed that does not terminate its final line leaves a complete object in
        // the buffer. A truncated object never parses, so a successful parse means it
        // is safe to emit now instead of waiting for the next chunk.
        const remainder = this.buffer.trim();
        if (remainder) {
            try {
                this.collect(JSON.parse(remainder), results);
                this.buffer = '';
            } catch {
                // Genuinely partial line, wait for more data
            }
        }

        if (this.buffer.length > MAX_BUFFER_CHARS) {
            Logger.warn(`[Feed] Discarding ${this.buffer.length} buffered chars with no line break`);
            this.buffer = '';
        }

        return results;
    }

    private parseLine(line: string, results: JsonObject[]): void {
        const trimmed = line.trim();
        if (!trimmed) return;

        try {
            this.collect(JSON.parse(trimmed), results);
            return;
        } catch {
            // Fall through to repair
        }

        try {
            this.collect(JSON.parse(jsonrepair(trimmed)), results);
        } catch (e: any) {
            Logger.warn(`[Feed] Dropped unparseable line: ${e?.message ?? e}`);
            Logger.debug(`[Feed] Line was: ${trimmed.slice(0, 500)}`);
        }
    }

    private collect(parsed: unknown, results: JsonObject[]): void {
        const items = Array.isArray(parsed) ? parsed : [parsed];
        for (const item of items) {
            if (item && typeof item === 'object' && !Array.isArray(item)) {
                results.push(item as JsonObject);
            }
        }
    }
}
