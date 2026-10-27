const makeField = (field) => Object.freeze(field)

const makePaper = (paper) => Object.freeze({
  schemaVersion: 1,
  grading: Object.freeze({ mode: 'manual', passingPercentage: null }),
  ...paper,
  fields: Object.freeze(paper.fields.map(makeField))
})

export const PUZZLE_CONFIG = Object.freeze({
  apiMode: import.meta.env.VITE_PUZZLE_API_MODE || 'auto',
  pollIntervalMs: 20000,
  draftDelayMs: 3000,
  playerStorageKey: 'sw-racing-player-id-v1',
  progressStorageKey: 'sw-racing-puzzle-progress-v2',
  legacyProgressStorageKey: 'sw-racing-puzzle-progress-v1',
  checkpointRadius: 4.8,
  submissionStation: Object.freeze({
    name: 'Answer Submission Station',
    x: 0,
    y: -8,
    interactionRadius: 5.2
  }),
  puzzles: Object.freeze([
    makePaper({
      id: 'checkpoint-1',
      paperId: 'demo-paper-1',
      checkpointId: 1,
      lockIndex: 0,
      timerSeconds: 300,
      title: 'The Signal Paper',
      prompt: `Placeholder paper for Checkpoint 1.

This paper demonstrates a mixed response: choose a method, show working, add a short subpart and provide a numerical answer. Solve it on paper, then physically drive to the Answer Submission Station before the countdown reaches zero.`,
      fields: [
        { id: 'method_choice', type: 'mcq', label: 'Which method did you use?', questionText: 'Placeholder multiple-choice question.', required: true, options: Object.freeze([
          Object.freeze({ value: 'method-a', label: 'Method A' }),
          Object.freeze({ value: 'method-b', label: 'Method B' }),
          Object.freeze({ value: 'method-c', label: 'Method C' })
        ]) },
        { id: 'working_step_1', type: 'textarea', label: 'Intermediate step 1', placeholder: 'Show the first important step…', required: true, maxLength: 2000 },
        { id: 'working_step_2', type: 'text', label: 'Intermediate step 2 or variable value', placeholder: 'Enter a short value or explanation…', required: false, maxLength: 500 },
        { id: 'final_value', type: 'number', label: 'Final numerical value', placeholder: '0', required: true, step: 'any' }
      ]
    }),
    makePaper({
      id: 'checkpoint-2',
      paperId: 'demo-paper-2',
      checkpointId: 2,
      lockIndex: 1,
      timerSeconds: 360,
      title: 'The Water Tower Paper',
      prompt: `Placeholder paper for Checkpoint 2.

Use the Water Tower observations to answer each subpart. This placeholder shows that every checkpoint may have a different schema and countdown while using the same secure review flow.`,
      fields: [
        { id: 'tower_reading', type: 'number', label: 'Observed tower reading', questionText: 'Enter the placeholder numerical reading.', placeholder: '0', required: true, step: '0.1' },
        { id: 'unit_choice', type: 'mcq', label: 'Choose the working unit', required: true, options: Object.freeze([
          Object.freeze({ value: 'metres', label: 'Metres' }),
          Object.freeze({ value: 'litres', label: 'Litres' }),
          Object.freeze({ value: 'seconds', label: 'Seconds' })
        ]) },
        { id: 'tower_reasoning', type: 'textarea', label: 'Explain your reasoning', placeholder: 'Show your working…', required: true, maxLength: 2000 },
        { id: 'tower_subpart', type: 'text', label: 'Short subpart answer', placeholder: 'Short answer…', required: false, maxLength: 500 }
      ]
    }),
    makePaper({
      id: 'checkpoint-3',
      paperId: 'demo-paper-3',
      checkpointId: 3,
      lockIndex: 2,
      timerSeconds: 420,
      title: 'The Depot Paper',
      prompt: `Placeholder paper for Checkpoint 3.

Complete the final mixed-format paper, drive back to the Answer Submission Station and wait for the examiner. Approval awards the third and final lock code.`,
      fields: [
        { id: 'route_choice', type: 'mcq', label: 'Select the correct placeholder route', required: true, options: Object.freeze([
          Object.freeze({ value: 'north', label: 'North siding' }),
          Object.freeze({ value: 'central', label: 'Central line' }),
          Object.freeze({ value: 'south', label: 'South siding' })
        ]) },
        { id: 'depot_calculation', type: 'textarea', label: 'Calculation and working', placeholder: 'Show every important step…', required: true, maxLength: 2400 },
        { id: 'depot_result', type: 'number', label: 'Final result', placeholder: '0', required: true, step: 'any' },
        { id: 'depot_note', type: 'text', label: 'Optional note for the examiner', placeholder: 'Any clarification…', required: false, maxLength: 500 }
      ]
    })
  ])
})

export const getPuzzle = (id) => PUZZLE_CONFIG.puzzles.find((puzzle) => puzzle.id === id)

export const getFallbackPaper = (checkpointId = 1) => (
  PUZZLE_CONFIG.puzzles.find((puzzle) => puzzle.checkpointId === Number(checkpointId)) || PUZZLE_CONFIG.puzzles[0]
)
