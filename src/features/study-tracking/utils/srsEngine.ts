import { SRSData } from "../../../types/appTypes";

export function calculateNextReview(currentBox: number, isMastered: boolean): SRSData {
  let newBoxNumber = currentBox;

  if (isMastered) {
    newBoxNumber = Math.min(currentBox + 1, 5); // Max out at Box 5
  } else {
    newBoxNumber = 1; // Reset to Box 1
  }

  let interval = 1; // Default to 1 day
  switch (newBoxNumber) {
    case 1:
      interval = 1;
      break;
    case 2:
      interval = 3;
      break;
    case 3:
      interval = 7;
      break;
    case 4:
      interval = 14;
      break;
    case 5:
      interval = 30;
      break;
    default:
      interval = 1;
  }

  const nextReviewDate = new Date();
  nextReviewDate.setDate(nextReviewDate.getDate() + interval);

  return {
    boxNumber: newBoxNumber,
    interval: interval,
    isMastered: isMastered,
    next_review_date: nextReviewDate.toISOString()
  };
}
