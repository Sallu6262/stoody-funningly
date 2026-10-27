export const STORY_CONFIG = Object.freeze({
  cinematicDuration: 8.2,
  dialogue: [
    {
      eyebrow: 'AN URGENT MESSAGE',
      title: 'Your friend is trapped',
      text: 'Three locks hold them to the railway. Beyond the bend, something waits inside the dark tunnel.'
    },
    {
      eyebrow: 'THE RESCUE',
      title: 'Find three lock codes',
      text: 'Each puzzle location hides one code. Reach all three, solve what you find, then return to the tracks.'
    },
    {
      eyebrow: 'FIRST MISSION',
      title: 'Follow the first lead',
      text: 'Start with this short clue. Its answer will reveal your first destination.'
    }
  ],
  firstClue: {
    eyebrow: 'CLUE 01',
    title: 'Where should we begin?',
    prompt: 'I stand beyond the western curve, where a signal watches the rails. Name the place.',
    answers: ['signal point', 'signal', 'checkpoint 1', 'checkpoint one'],
    placeholder: 'Type your answer',
    error: 'Look west, toward the railway signal.'
  },
  reveal: {
    eyebrow: 'ROUTE UPDATED',
    title: 'Checkpoint 1 revealed',
    text: 'Signal Point is now marked on your map. Follow the orange beacon and distance guide.'
  },
  arrival: {
    eyebrow: 'CHECKPOINT 1',
    title: 'The first major puzzle awaits',
    text: 'Placeholder puzzle text will appear here. The full question and lock-code reward arrive in a later phase.'
  }
})
