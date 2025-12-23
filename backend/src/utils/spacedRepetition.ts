// Intervals in minutes: 15min, 1day, 3days, 7days, 15days, 30days
const INTERVALS = [15, 1440, 4320, 10080, 21600, 43200]

export type ReviewAction = 'easy' | 'hard' | 'again'

export interface ReviewResult {
  nextDisplay: Date
  newIntervalIndex: number
  status: 'new' | 'learning' | 'review'
}

export function calculateNextReview(
  currentIntervalIndex: number,
  action: ReviewAction
): ReviewResult {
  let newIntervalIndex: number
  let intervalMinutes: number

  switch (action) {
    case 'easy':
      // Advance to next interval
      newIntervalIndex = Math.min(currentIntervalIndex + 1, INTERVALS.length - 1)
      intervalMinutes = INTERVALS[newIntervalIndex]
      break

    case 'hard':
      // Half of the next interval
      const nextIndex = Math.min(currentIntervalIndex + 1, INTERVALS.length - 1)
      intervalMinutes = Math.floor(INTERVALS[nextIndex] / 2)
      newIntervalIndex = currentIntervalIndex // Stay at current level
      break

    case 'again':
      // Reset to 1 day (index 1)
      newIntervalIndex = 1
      intervalMinutes = INTERVALS[1]
      break
  }

  const nextDisplay = calculateNextDisplayTime(intervalMinutes)
  const status = determineStatus(newIntervalIndex)

  return { nextDisplay, newIntervalIndex, status }
}

function calculateNextDisplayTime(intervalMinutes: number): Date {
  const now = new Date()

  // For intervals less than 24 hours (1440 minutes), use exact time
  if (intervalMinutes < 1440) {
    return new Date(now.getTime() + intervalMinutes * 60 * 1000)
  }

  // For intervals >= 1 day, set to 3:00 AM on target day
  const daysToAdd = Math.floor(intervalMinutes / 1440)
  const targetDate = new Date(now)
  targetDate.setDate(targetDate.getDate() + daysToAdd)
  targetDate.setHours(3, 0, 0, 0) // 3:00 AM

  return targetDate
}

function determineStatus(intervalIndex: number): 'new' | 'learning' | 'review' {
  if (intervalIndex === 0) return 'new'
  if (intervalIndex <= 2) return 'learning'
  return 'review'
}

export function getInitialReview(): ReviewResult {
  // New cards are immediately available for review
  return {
    nextDisplay: new Date(),
    newIntervalIndex: 0,
    status: 'new',
  }
}
