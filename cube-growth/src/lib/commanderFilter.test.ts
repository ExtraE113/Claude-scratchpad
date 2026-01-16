/**
 * Unit tests for commanderFilter module
 */

import { describe, it, expect } from 'vitest';
import { COMMANDER_ONLY_CARDS, isCommanderOnlyCard } from './commanderFilter';

describe('COMMANDER_ONLY_CARDS', () => {
  it('contains expected staple Commander cards', () => {
    expect(COMMANDER_ONLY_CARDS.has('Command Tower')).toBe(true);
    expect(COMMANDER_ONLY_CARDS.has('Arcane Signet')).toBe(true);
    expect(COMMANDER_ONLY_CARDS.has("Commander's Sphere")).toBe(true);
    expect(COMMANDER_ONLY_CARDS.has('Jeweled Lotus')).toBe(true);
    expect(COMMANDER_ONLY_CARDS.has('Dockside Extortionist')).toBe(true);
  });

  it('contains free spells that check for commander', () => {
    expect(COMMANDER_ONLY_CARDS.has('Fierce Guardianship')).toBe(true);
    expect(COMMANDER_ONLY_CARDS.has('Deflecting Swat')).toBe(true);
    expect(COMMANDER_ONLY_CARDS.has('Deadly Rollick')).toBe(true);
    expect(COMMANDER_ONLY_CARDS.has('Flawless Maneuver')).toBe(true);
    expect(COMMANDER_ONLY_CARDS.has('Obscuring Haze')).toBe(true);
  });

  it('contains commander-specific lands', () => {
    expect(COMMANDER_ONLY_CARDS.has('Command Beacon')).toBe(true);
    expect(COMMANDER_ONLY_CARDS.has('Opal Palace')).toBe(true);
    expect(COMMANDER_ONLY_CARDS.has('Path of Ancestry')).toBe(true);
    expect(COMMANDER_ONLY_CARDS.has('War Room')).toBe(true);
  });

  it('does not contain normal cube cards', () => {
    expect(COMMANDER_ONLY_CARDS.has('Lightning Bolt')).toBe(false);
    expect(COMMANDER_ONLY_CARDS.has('Sol Ring')).toBe(false);
    expect(COMMANDER_ONLY_CARDS.has('Brainstorm')).toBe(false);
  });
});

describe('isCommanderOnlyCard', () => {
  describe('with cards in COMMANDER_ONLY_CARDS set', () => {
    it('returns true for Command Tower', () => {
      expect(isCommanderOnlyCard('Command Tower')).toBe(true);
    });

    it('returns true for Arcane Signet', () => {
      expect(isCommanderOnlyCard('Arcane Signet')).toBe(true);
    });

    it('returns true for Jeweled Lotus', () => {
      expect(isCommanderOnlyCard('Jeweled Lotus')).toBe(true);
    });

    it('returns true for cards in set even with irrelevant oracle text', () => {
      expect(isCommanderOnlyCard('Command Tower', 'Tap: Add one mana')).toBe(true);
    });
  });

  describe('with oracle text containing "commander"', () => {
    it('returns true when oracle text mentions commander', () => {
      const oracleText = 'If you control your commander, this spell costs {0} less to cast.';
      expect(isCommanderOnlyCard('Some Card', oracleText)).toBe(true);
    });

    it('returns true for Commander Ninjutsu ability', () => {
      const oracleText = 'Commander ninjutsu {2}{U}{B}';
      expect(isCommanderOnlyCard('Ninja Card', oracleText)).toBe(true);
    });

    it('returns true for lieutenant abilities', () => {
      const oracleText = 'Lieutenant - As long as you control your commander, this creature gets +2/+2.';
      expect(isCommanderOnlyCard('Lieutenant Card', oracleText)).toBe(true);
    });
  });

  describe('with oracle text containing "command zone"', () => {
    it('returns true when oracle text mentions command zone', () => {
      const oracleText = 'You may cast this card from your command zone.';
      expect(isCommanderOnlyCard('Zone Card', oracleText)).toBe(true);
    });

    it('returns true for cards that reference command zone cost', () => {
      const oracleText = 'This costs {2} less if cast from your command zone.';
      expect(isCommanderOnlyCard('Discount Card', oracleText)).toBe(true);
    });
  });

  describe('with normal cards', () => {
    it('returns false for Lightning Bolt', () => {
      const oracleText = 'Lightning Bolt deals 3 damage to any target.';
      expect(isCommanderOnlyCard('Lightning Bolt', oracleText)).toBe(false);
    });

    it('returns false for Counterspell', () => {
      const oracleText = 'Counter target spell.';
      expect(isCommanderOnlyCard('Counterspell', oracleText)).toBe(false);
    });

    it('returns false for creatures without commander text', () => {
      const oracleText = 'Flying\nWhen this creature enters the battlefield, draw a card.';
      expect(isCommanderOnlyCard('Mulldrifter', oracleText)).toBe(false);
    });

    it('returns false when no oracle text is provided and name is not in set', () => {
      expect(isCommanderOnlyCard('Random Card')).toBe(false);
    });

    it('returns false for empty oracle text', () => {
      expect(isCommanderOnlyCard('Vanilla Creature', '')).toBe(false);
    });
  });

  describe('case insensitivity', () => {
    it('matches "commander" regardless of case in oracle text', () => {
      expect(isCommanderOnlyCard('Card', 'COMMANDER ability')).toBe(true);
      expect(isCommanderOnlyCard('Card', 'Commander ability')).toBe(true);
      expect(isCommanderOnlyCard('Card', 'commander ability')).toBe(true);
      expect(isCommanderOnlyCard('Card', 'CoMmAnDeR ability')).toBe(true);
    });

    it('matches "command zone" regardless of case in oracle text', () => {
      expect(isCommanderOnlyCard('Card', 'COMMAND ZONE')).toBe(true);
      expect(isCommanderOnlyCard('Card', 'Command Zone')).toBe(true);
      expect(isCommanderOnlyCard('Card', 'command zone')).toBe(true);
      expect(isCommanderOnlyCard('Card', 'CoMmAnD zOnE')).toBe(true);
    });

    it('is case-sensitive for card names in the set', () => {
      // The set contains exact names, so case matters for name lookup
      expect(isCommanderOnlyCard('command tower')).toBe(false);
      expect(isCommanderOnlyCard('COMMAND TOWER')).toBe(false);
      expect(isCommanderOnlyCard('Command Tower')).toBe(true);
    });
  });
});
