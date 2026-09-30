import type { PodcastAuthor, PodcastPageContent } from "../lib/types";

// Both hosts appear on every episode, so they're named once here rather than
// repeated six times below.
const andrew: PodcastAuthor = {
  name: "Andrew Abbey",
  imageSrc: "/images/podcast/author-andrew.webp",
};

const sardor: PodcastAuthor = {
  name: "Sardor Akhmedov",
  imageSrc: "/images/podcast/author-sardor.webp",
};

const hosts = [andrew, sardor];

export const podcastPage: PodcastPageContent = {
  heading: "The Appsurd Show",
  description:
    "On this channel, we delve into the latest trends, share insights, and provide tutorials on AI technologies and mobile app development. Whether you're a developer, entrepreneur, or tech enthusiast, our content is designed to inform and inspire you.",

  // Newest first -- the same order the episodes were published in.
  episodes: [
    {
      title:
        "Mastering Mobile App Development: Overcoming Perfectionism, AI Search & The Future of MVPs",
      youtubeId: "y_glnavy_FE",
      posterSrc: "/images/podcast/y_glnavy_FE.jpg",
      summary:
        "In this episode of our tech and startup podcast, we dive into the challenges of mobile app development, the rise of AI-powered search, and how to build successful MVPs without getting stuck in perfectionism.",
      authors: hosts,
      highlights: [
        {
          label: "Special Guest",
          text: "Sardor, founder of Synergy Labs, shares expert insights from leading a boutique mobile and web app development firm in Miami, Florida.",
        },
        {
          label: "Why MVPs Matter",
          text: "How to launch faster, avoid perfectionism, and build products that users love.",
        },
        {
          label: "AI & The Future of Search",
          text: "Could AI-powered mobile browsers and search engines disrupt Google's dominance?",
        },
        {
          label: "Elon Musk's AI Move",
          text: "Exploring the impact of Grok, Twitter's integrated AI, on social media and online interaction.",
        },
        {
          label: "AI Training for Businesses",
          text: "Why companies must train their teams to leverage AI tools like ChatGPT, and how it opens new business opportunities.",
        },
      ],
    },
    {
      title:
        "The Future of Mobile Apps: Nikita Bier's Explode, Social Media Trends & App Innovation",
      youtubeId: "KhSm4h7CrNY",
      posterSrc: "/images/podcast/KhSm4h7CrNY.jpg",
      summary:
        "In this episode of our Founder Interview Podcast, we explore the latest mobile app trends, social media's influence, and innovative app ideas that are shaping the digital landscape.",
      authors: hosts,
      highlights: [
        {
          label: "Overlooked Mobile Apps",
          text: "What are the most ignored apps, and how do our personal usage habits impact their success?",
        },
        {
          label: "Nikita Bier's New App, Explode",
          text: "Can this viral social app compete with Snapchat and change the way we connect online?",
        },
        {
          label: "Game-Changing Web Apps",
          text: "How could a document-converting web app revolutionize LLM (Large Language Model) processing?",
        },
        {
          label: "Mobile App Landing Page Design",
          text: "Key strategies to boost conversions and user engagement.",
        },
        {
          label: "The Offline Movement",
          text: "Why are more users embracing digital detox apps and seeking intentional offline experiences?",
        },
        {
          label: "Inside Sardor's Business",
          text: "Exciting updates on new projects, business growth, and potential collaborations.",
        },
      ],
    },
    {
      title: "The $500 Billion Stargate Project: OpenAI's Bold Plan to Dominate AI's Future",
      youtubeId: "CUTk9rrF47A",
      posterSrc: "/images/podcast/CUTk9rrF47A.jpg",
      summary:
        "Join Andrew and Sardor in this must-watch episode as they explore the latest AI innovations, investments, and challenges shaping the future of technology!",
      authors: hosts,
      highlights: [
        {
          label: "Breaking AI News",
          text: "OpenAI, Oracle, and SoftBank are spearheading the groundbreaking $500 billion Stargate project—but what does this mean for the AI industry?",
        },
        {
          label: "DeepSeek's Open-Source AI",
          text: "A new game-changing AI model is here! Will DeepSeek redefine open-source AI and challenge industry giants?",
        },
        {
          label: "Health Apps & AI",
          text: "Experts like Nikita Beer and Andrew Wilkinson reveal the biggest obstacles in launching AI-driven health apps in a highly regulated market.",
        },
        {
          label: "OpenAI's Latest Innovations",
          text: "What are OpenAI's new operators and agents, and how will they impact developers, businesses, and AI applications?",
        },
      ],
    },
    {
      title: "The Future of AI Startups: Disrupting Tech Giants, PMF Challenges & AI-Driven Design",
      youtubeId: "MZguGQviako",
      posterSrc: "/images/podcast/MZguGQviako.jpg",
      summary:
        "Welcome to this week's episode of the Founder Pod at Synergy Labs, where we explore the latest in AI innovation, startup growth, and industry disruption!",
      authors: hosts,
      highlights: [
        {
          label: "AI in Web Design",
          text: "How a unique AI automation agency is redefining website design—what does this mean for the future of UI/UX?",
        },
        {
          label: "AI-First Startups on the Rise",
          text: "The explosive growth of Cursor, Bolt, and other AI-driven companies—but can they sustain momentum?",
        },
        {
          label: "Disrupting the Tech Giants",
          text: "Why Zapier, Slack, and other incumbents are struggling against faster-moving startups.",
        },
        {
          label: "PMF or Die – The Ultimate Startup Challenge",
          text: "Blake Anderson and his team attempt to build a $1M business in 90 days, live-streaming every step.",
        },
        {
          label: "Breaking Apple & Google's Dominance",
          text: "Could alternative apps challenge native iOS and Android applications?",
        },
        {
          label: "The Power of Personal Branding",
          text: "Why founders & developers should build a brand to unlock unexpected opportunities.",
        },
      ],
    },
    {
      title: "AI Startups, Product-Market Fit & Disrupting Big Tech | Founder Pod at Synergy Labs",
      youtubeId: "XoZywf8_988",
      posterSrc: "/images/podcast/XoZywf8_988.jpg",
      summary:
        "Join us for this week's episode of the Founder Pod at Synergy Labs, where we dive into the latest trends in AI startups, product-market fit, and tech disruption.",
      authors: hosts,
      highlights: [
        {
          label: "The Rise of AI-First Startups",
          text: "How companies like Cursor and Bolt are scaling fast—can they maintain their momentum?",
        },
        {
          label: "Big Tech Under Pressure",
          text: "Why Zapier, Slack, and other incumbents are struggling to keep up with new, faster-moving competitors.",
        },
        {
          label: "The “PMF or Die” Challenge",
          text: "Blake Anderson and his team attempt to build a $1M business in just 90 days, live-streaming the entire journey.",
        },
        {
          label: "AI-Driven Web Design",
          text: "A look into how AI automation agencies are redefining web design and UX.",
        },
        {
          label: "Can Alternative Apps Compete with Apple & Google?",
          text: "Exploring the potential for disrupting native apps and changing the mobile ecosystem.",
        },
        {
          label: "The Power of Personal Branding",
          text: "Why founders and tech professionals should invest in building a personal brand for long-term success.",
        },
      ],
    },
    {
      title: "From Playbook to Product: How Founders Are Building Viral Apps in 2025",
      youtubeId: "07GiKM0IPEE",
      posterSrc: "/images/podcast/07GiKM0IPEE.jpg",
      summary:
        "In this episode, we dive deep into the strategies behind building viral apps in 2025. Whether you're a solo founder, startup team, or product enthusiast, this conversation uncovers the frameworks, tools, and mindset needed to go from idea to explosive growth.",
      authors: hosts,
      highlights: [
        { label: "The viral app playbook", text: "The tactics top founders are using today." },
        { label: "Validating an idea", text: "How to test your app idea quickly and effectively." },
        {
          label: "Lessons from apps that scaled fast",
          text: "What worked for them — and what held others back.",
        },
        {
          label: "Platform-specific tactics",
          text: "What still works on iOS, Android, and the web in 2025.",
        },
        {
          label: "The future of app distribution",
          text: "What it means for new builders.",
        },
        {
          label: "Firsthand insights",
          text: "Case studies and real-world examples — a behind-the-scenes look at building apps that don't just launch, they take off.",
        },
      ],
    },
  ],
};
