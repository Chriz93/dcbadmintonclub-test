export const tour = [
  {
    title: "A player opens your link",
    role: "Player",
    screen: "home",
    cue: "Continue as Maya Chen",
    narration:
      "Welcome, Christy. This is a fictional Maplewood league with twenty-five players. We will follow Maya Chen, then switch to your administrator view. A real player opens the website link and signs in using the code sent to their email. This demo simulates that step without sending a message. Press Continue as Maya, or use Next to follow the tour.",
  },
  {
    title: "Details and the season agreement",
    role: "Player",
    screen: "register",
    cue: "Complete the demo checklist",
    narration:
      "After signing in, a new player fills in their details and chooses regular or spare membership. They review this season's agreement. A participant under eighteen needs a separately signed-in guardian and your verification. There is no minimum age. A fresh agreement is needed each season. This screen uses a simulated checklist, not a legal signature. A payment reference is only a claim until you check the bank.",
  },
  {
    title: "Christy approves and seeds",
    role: "Admin",
    screen: "admin",
    cue: "Review Maya’s approval",
    narration:
      "Now you are viewing the administrator demonstration. You check the registration, current-season agreement, guardian review if needed, and actual payment. Only then do you approve the player and set their initial seed. Maya is seeded thirteenth, which starts her at eleven hundred and eighty ELO. You decide the initial order. The app calculates later changes from match results.",
  },
  {
    title: "Before Tuesday: respond to attendance",
    role: "Player",
    screen: "home",
    cue: "Choose I’m coming",
    narration:
      "We now jump forward to the fourth club night. Three fictional sessions give every player a real history to explore. Maya's home screen shows her next session, ELO, last result and attendance response. She chooses I'm coming or Can't attend. At least seventy-two hours of notice qualifies for the fourteen dollar absence refund. Missing a response is not automatically a no-show. Reminder delivery is still a launch task.",
  },
  {
    title: "At the gym: check in",
    role: "Admin",
    screen: "admin",
    cue: "Review all 25 checked-in players",
    narration:
      "At the gym, you confirm who actually arrived. Tonight all twenty-five fictional players are checked in. There are six courts: five have four players and one has five. Only approved players and confirmed spares belong in the assignment. An unanswered attendance response does not justify a penalty. You review a committed player's actual absence before applying the one-court no-show penalty.",
  },
  {
    title: "Everyone finds their court",
    role: "Player",
    screen: "courts",
    cue: "Open Court 6 and any player",
    narration:
      "This is the gym layout from your old website. Courts one, two and three are across the top, with six, five and four below. Every name opens a player profile. Court six shows all five players, the doubles pairings and the player resting for each game. Four-player courts play three games to twenty-one. A five-player court plays five games to fifteen, so everyone partners with everyone and rests once.",
  },
  {
    title: "Players enter their scores",
    role: "Player",
    screen: "scores",
    cue: "Save one of Maya’s results",
    narration:
      "After a game, any of its four participants can submit the final score. Maya sees her own games first. The form rejects unfinished or tied scores. Once a result is saved, another player cannot silently overwrite it; Christy can make a recorded correction. You can enter a result yourself here. For the tour, the next step fills the remaining results with clearly labelled demo scores.",
  },
  {
    title: "Review the ladder movement",
    role: "Admin",
    screen: "movement",
    cue: "Inspect up, down and stayed",
    narration:
      "With twenty out of twenty games scored, you review the next round. The app ranks each court by win percentage, then points percentage, then a stable player identifier for an exact tie. Adjacent courts exchange the strongest and weakest eligible positions, preserving all twenty-five players. You review the moves before publishing. Within the evening, this ladder movement decides courts; ELO is used for the next session's starting order.",
  },
  {
    title: "Finish the night",
    role: "Admin",
    screen: "sessions",
    cue: "Inspect the completed session",
    narration:
      "The tour has now simulated all four rounds: eighty games, with the final movement recorded separately from the last court played. The completed session shows everyone's final court, wins, losses and movement. Closing the session publishes official ELO. Our opponent-based calculation rewards an unexpected win more than an expected win, and averages changes within each round so the five-player court does not gain extra weight.",
  },
  {
    title: "Players explore their progress",
    role: "Player",
    screen: "profile",
    cue: "Open ELO and match history",
    narration:
      "Maya can now see her rating trend, court history and every previous match, including her partner, opponents, score and result. Every league member can open any other player's badminton performance. Private contact, payment, guardian and agreement records do not appear here. The Standings tabs separate court leaders, ELO rankings, statistics, final session placements and match history.",
  },
  {
    title: "Fix a score with confidence",
    role: "Admin",
    screen: "scores",
    cue: "Correct a result with a reason",
    narration:
      "If a score is wrong, you open that game as administrator, enter the corrected result and explain why. In this demo, the result, player statistics and ELO history rebuild together. Courts on which games were already played remain preserved. A historical score correction is not permission to silently rewrite later court assignments. You can inspect the audit entry in Administration and reset the demo whenever you want.",
  },
  {
    title: "Your weekly routine and what remains",
    role: "Admin",
    screen: "admin",
    cue: "Browse freely or restart the tour",
    narration:
      "Your weekly routine becomes: review responses, verify spare payments, check attendance, publish courts, review movements and close the session. Spares qualify after both their response and verified payment, subject to an available place. School cancellations give regular players two physical shuttlecocks and confirmed paid spares a full twenty dollar refund. These league views and player scoring are now connected in the TEST app. This tour uses fictional players so you can practise safely. Email delivery setup, agreement review, independent account checks and a real backup restore still need verification before launch. You can now browse every screen or replay any step.",
  },
] as const;
