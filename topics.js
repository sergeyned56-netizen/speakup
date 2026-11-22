// Free-talk topics. "Surprise me" lets the robot pick.
window.TOPICS = [
  { id: "surprise", label: "🎲 Surprise me", prompt: null },
  { id: "review", label: "🔁 Review my notebook", prompt: null, review: true },
  { id: "day", label: "☕ My day", prompt: "the learner's day, routines and plans" },
  { id: "travel", label: "✈️ Travel", prompt: "travel: places the learner has been, dream trips, living abroad" },
  { id: "work", label: "💼 Work", prompt: "work and career, including teaching" },
  { id: "tech", label: "🤖 Tech & AI", prompt: "technology, AI, apps and the internet" },
  { id: "movies", label: "🎬 Movies & series", prompt: "movies, TV series and what the learner is watching" },
  { id: "food", label: "🍜 Food", prompt: "food, cooking and restaurants" },
  { id: "debate", label: "⚔️ Debate", prompt: "a light debate: pick a fun controversial-but-safe question and ask the learner to defend a position, then push back" },
  { id: "story", label: "📖 Tell a story", prompt: "storytelling: ask the learner to tell a story from their life and ask follow-up questions" },
];

// Missions: role-plays with a goal. The robot plays a character and judges whether the goal was reached.
window.MISSIONS = [
  { id: "flat", label: "🏠 Rent a flat abroad", role: "a landlord showing a one-bedroom flat in another country", goal: "find out the rent, deposit, what bills are included and the minimum contract length, and agree on a viewing date", twist: "the landlord is a bit vague about the bills" },
  { id: "border", label: "🛂 Border control", role: "a strict immigration officer at an airport", goal: "explain the purpose of the trip, where you will stay, how long, and answer follow-up questions confidently", twist: "the officer asks one unexpected question about money or a return ticket" },
  { id: "interview", label: "🎤 Job interview", role: "an interviewer at an international company hiring for a job the learner chooses", goal: "introduce yourself, answer 'tell me about yourself', a strengths/weaknesses question and ask one question back", twist: "the interviewer asks about a gap or a failure" },
  { id: "refund", label: "🧾 Get a refund", role: "a shop assistant; the learner bought headphones that stopped working after a week", goal: "explain the problem politely but firmly and get a refund or a replacement", twist: "the learner has lost the receipt" },
  { id: "doctor", label: "🩺 See a doctor", role: "a GP doctor at a clinic abroad", goal: "describe the symptoms of a bad cold (when it started, how it feels), understand the advice and ask about medicine", twist: "the doctor uses one or two words the learner may not know — the learner should ask what they mean" },
  { id: "restaurant", label: "🍝 Restaurant problem", role: "a waiter at a busy restaurant", goal: "order a meal, then politely complain that the dish is cold and get it fixed", twist: "the waiter is in a hurry and slightly defensive" },
  { id: "party", label: "🎉 Small talk at a party", role: "a friendly stranger at a party in London", goal: "keep a natural small-talk conversation for a few minutes: find three things in common and swap contacts", twist: "the stranger tells a joke and expects a reaction" },
  { id: "salary", label: "💰 Negotiate a salary", role: "an HR manager making a job offer", goal: "get a 15% higher salary or an extra benefit using polite, persuasive language", twist: "the manager first says the budget is fixed" },
];
