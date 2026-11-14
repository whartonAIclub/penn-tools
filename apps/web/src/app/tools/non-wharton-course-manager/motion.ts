// Start an animation a little later, so things appear one after another.
export function delay(seconds: number) {
  return { animationDelay: `${seconds}s` };
}
