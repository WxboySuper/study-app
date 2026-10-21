/**
 * The design system of the game screens.
 *
 * Every screen of the app is built from these pieces: a layered background
 * with drifting halos, chunky 3D buttons, glassy cards, radial glows,
 * particle bursts, an animated token counter and the rarity badges.
 */

export { GameBackground, type BackgroundVariant, type GameBackgroundProps } from './GameBackground';
export { GameButton, type GameButtonProps, type GameButtonSize, type GameButtonVariant } from './GameButton';
export { GlassCard, type GlassCardProps } from './GlassCard';
export { Glow, type GlowProps } from './Glow';
export { LightRays, type LightRaysProps } from './LightRays';
export { Particles, type ParticlesProps } from './Particles';
export { Coin, TokenCounter, type TokenCounterProps } from './TokenCounter';
export { RarityBadge, type RarityBadgeProps } from './RarityBadge';
export { HeaderChip, ScreenHeader, type ScreenHeaderProps } from './ScreenHeader';
export { ProgressRing, type ProgressRingProps } from './ProgressRing';
export { Shine, type ShineProps } from './Shine';
export { WheelGlyph, type WheelGlyphProps } from './WheelGlyph';
export { Wordmark, type WordmarkProps } from './Wordmark';
