import { describe, expect, it } from 'vitest';
import { parseActivateCommand } from '../src/lib/telegram/parser';
describe('activation parser', () => { it('parses normal command', () => expect(parseActivateCommand('/activate 482731 @driver')).toEqual({code:'482731',username:'driver'})); it('parses group command', () => expect(parseActivateCommand('/activate@MyBot 482731 @driver')).toEqual({code:'482731',username:'driver'})); it('rejects malformed command', () => expect(parseActivateCommand('/activate 12 @driver')).toBeNull()); });
