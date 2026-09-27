(function (root, factory) {
  "use strict";
  var content = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = content;
  }
  root.EXAM_CONTENT = content;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // These answers show one way to respond. Other relevant answers are welcome.
  // Judge the student's spoken English, not their opinions or life experiences.
  return {
    version: "2.1",
    parts: [
      {
        id: "personality",
        name: "Personality",
        questions: [
          {
            id: "personality-1",
            prompt: "What two words describe you?",
            followUp: "What do you do that shows this?",
            example: "I am friendly and helpful. I talk to new students in my class. I help them find their classrooms."
          },
          {
            id: "personality-2",
            prompt: "Do you like meeting new people?",
            followUp: "Why do you feel this way?",
            example: "Yes, I like meeting new people. I like learning about their hobbies. We sometimes enjoy the same games."
          },
          {
            id: "personality-3",
            prompt: "Do you like to work alone or with other people?",
            followUp: "Why do you like this?",
            example: "I like to work with other people. We can share ideas and help each other. I enjoy talking about our work."
          },
          {
            id: "personality-4",
            prompt: "Are you usually quiet, or do you like to talk a lot?",
            followUp: "What are you like when you are with your friends?",
            example: "I am usually quiet in a big group. With my friends, I talk more. I tell them about my day and ask about their day."
          },
          {
            id: "personality-5",
            prompt: "Do you like trying new things?",
            followUp: "Why do you feel this way?",
            example: "Yes, I like trying new things. I enjoy learning new games and sports. A new activity can be fun, even when it is difficult at first."
          }
        ]
      },
      {
        id: "past",
        name: "Past",
        questions: [
          {
            id: "past-1",
            prompt: "What did you do last weekend?",
            followUp: "What did you like about it?",
            example: "I played basketball with two friends last weekend. We played at college on Saturday afternoon. I liked spending time with them."
          },
          {
            id: "past-2",
            prompt: "What did you do on a day you enjoyed at school?",
            followUp: "Why did you enjoy that day?",
            example: "My class played games on our sports day. I ran in a race and watched my classmates play basketball. I enjoyed the day because we had fun together."
          },
          {
            id: "past-3",
            prompt: "Where did you go in your free time last week?",
            followUp: "What did you do there?",
            example: "I went to the college library last week. I read a book and did some homework there. After that, I talked to a friend outside."
          },
          {
            id: "past-4",
            prompt: "What was the last movie or video you watched?",
            followUp: "What did you like or dislike about it?",
            example: "I watched a short video about a cat yesterday. The cat tried to open a box. I liked it because the cat was funny."
          },
          {
            id: "past-5",
            prompt: "What is one thing you learned last year?",
            followUp: "How did you learn it?",
            example: "I learned to cook noodles last year. I watched a short video and tried it at home. I practiced several times, and my noodles got better."
          }
        ]
      },
      {
        id: "present",
        name: "Present",
        questions: [
          {
            id: "present-1",
            prompt: "What do you usually do after your classes?",
            followUp: "Why do you do this?",
            example: "I usually go for a walk after my classes. Sometimes I walk with a friend. It helps me relax after sitting in class."
          },
          {
            id: "present-2",
            prompt: "What do you like to do in your free time?",
            followUp: "Why do you enjoy it?",
            example: "I like drawing in my free time. I often draw trees and flowers. I enjoy it because it is quiet and helps me relax."
          },
          {
            id: "present-3",
            prompt: "What food do you like to eat?",
            followUp: "When do you usually eat it?",
            example: "I like rice with vegetables and chicken. I usually eat it for lunch in the college dining hall. Sometimes I have it for dinner too."
          },
          {
            id: "present-4",
            prompt: "What place near your college do you like?",
            followUp: "What do you usually do there?",
            example: "I like a small park near my college. I usually walk there on the weekend. Sometimes I sit under a tree and listen to music."
          },
          {
            id: "present-5",
            prompt: "What music do you like to listen to?",
            followUp: "When do you usually listen to it?",
            example: "I like pop music with happy songs. I usually listen to it when I walk to class. I also listen to music when I clean my room."
          }
        ]
      },
      {
        id: "future",
        name: "Future",
        questions: [
          {
            id: "future-1",
            prompt: "What would you like to do next weekend?",
            followUp: "Why would you like to do this?",
            example: "I would like to play badminton next weekend. I want to get some exercise and see my friends. We could play at college on Saturday."
          },
          {
            id: "future-2",
            prompt: "What job would you like to do in the future?",
            followUp: "Why would you like this job?",
            example: "I would like to be a teacher. I enjoy helping people learn new things. I would like to teach young children."
          },
          {
            id: "future-3",
            prompt: "What place would you like to visit in the future?",
            followUp: "What would you like to do there?",
            example: "I would like to visit Chengdu. I would like to see the pandas and walk around the city. I would also like to try some local food."
          },
          {
            id: "future-4",
            prompt: "What would you like to learn to do in the future?",
            followUp: "How could you learn it?",
            example: "I would like to learn to swim. I could take lessons at a swimming pool. I could practice every week with a teacher."
          },
          {
            id: "future-5",
            prompt: "What would you like to do in your next English class?",
            followUp: "Why would you like to do this?",
            example: "I would like to play a word game in my next English class. Games help me remember new words. I also enjoy working with my classmates."
          }
        ]
      }
    ],
    criteria: [
      {
        id: "fluency",
        label: "Fluency",
        weight: 20,
        descriptors: [
          "You hear no spoken answer.",
          "You hear single words or short phrases. Long pauses often stop the student's answers.",
          "You hear short sentences with frequent pauses. You sometimes need to help the student continue.",
          "You hear short sentences, and the student continues without your help. Allow some thinking pauses."
        ]
      },
      {
        id: "pronunciation",
        label: "Pronunciation",
        weight: 15,
        descriptors: [
          "You cannot understand any spoken words.",
          "You find many words hard to understand and often need to ask the student to repeat them.",
          "You understand most words but sometimes need to ask the student to repeat them.",
          "You understand the speech easily. Allow a few unclear sounds."
        ]
      },
      {
        id: "contribution",
        label: "Answer content",
        weight: 40,
        descriptors: [
          "You hear no information that answers the questions.",
          "You hear very little relevant information, even when you help the student.",
          "You hear answers with some relevant information but few details.",
          "You hear answers to the main and follow-up questions, with useful details or examples."
        ]
      },
      {
        id: "accuracy",
        label: "Grammar and words",
        weight: 25,
        descriptors: [
          "You hear too little English to assess the student's grammar and word choices.",
          "You often find the meaning hard to understand because of grammar or word-choice errors.",
          "You usually understand the meaning. You hear simple grammar and words, with some errors.",
          "You hear simple grammar and words used well. Small errors do not prevent you from understanding the meaning."
        ]
      }
    ]
  };
});
