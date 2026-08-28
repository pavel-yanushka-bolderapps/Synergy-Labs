import type { HomePageContent } from "../lib/types";

export const home: HomePageContent = {
  hero: {
    heading: "AI + Mobile App\nDevelopment Agency",
    ctaButton: { label: "Free quote", href: "/contact" },
    phoneImageSrc: "/images/Iphone.avif",
    bgImageSrc: "/images/Hero-Bg.svg",
  },

  stats: {
    items: [
      { value: "5/5", label: "average client rating", iconSrc: "/images/synergy-hero-stat-01.svg" },
      { value: "10 weeks", label: "to launch your app", iconSrc: "/images/synergy-hero-stat-02.svg" },
      { value: "100+", label: "products", iconSrc: "/images/synergy-hero-stat-03.svg" },
    ],
  },

  selectedWorks: {
    heading: "Selected Works",
    viewAllButton: { label: "View all", href: "/portfolio" },
    items: [
      {
        slug: "clapper",
        clientName: "Clapper",
        logoSrc: "/images/logo.clapper.svg",
        logoAlt: "Clapper",
        tags: ["Social"],
        description:
          "Clapper partnered with us to bring their vision of a real community-driven social media platform to life. We developed and delivered the first version of their app, empowering users to share content, connect authentically, and engage with their audience without filters or algorithms. Our team ensured a seamless launch, laying the foundation for Clapper’s growth.",
        highlights: [
          { label: "18 weeks to launch", iconSrc: "/images/portfolio-black-weeks-to-launch.svg" },
          { label: "1M+ downloads", iconSrc: "/images/portfolio-black-downloads.svg" },
        ],
        imageSrc: "/images/V12f.webp",
        imageAlt:
          "Two smartphones displaying a social media app with video feeds and category tags like #Football and #FamilyFun.",
        caseStudyHref: "/projects/casestudy/clapper",
        theme: "light",
        backgroundImage: "linear-gradient(#fff, #96b7fd73 23%)",
      },
      {
        slug: "peanut",
        clientName: "Peanut",
        logoSrc: "/images/Peanut_App_Logo.svg",
        logoAlt: "Peanut",
        tags: ["Social"],
        description:
          "Peanut partnered with us to enhance their platform, providing a beautifully crafted design that resonates with their community of women seeking connection and support. We delivered a user-centered design tailored to the unique needs of their audience, while also outstaffing highly skilled developers to ensure seamless execution and implementation.",
        highlights: [
          { label: "22 weeks to launch", iconSrc: "/images/portfolio-black-weeks-to-launch.svg" },
          { label: "Over 5 million users", iconSrc: "/images/portfolio-black-downloads.svg" },
        ],
        imageSrc: "/images/peanut-app-image.webp",
        imageAlt:
          "Three smartphones displaying the Peanut app showing pregnancy week 8, supplement ad, and Needed introduction screen.",
        caseStudyHref: "/projects/casestudy/peanut",
        theme: "light",
        backgroundImage:
          "radial-gradient(circle at 0 0, #f3f3f3b5 23%, #fde9ea66 35%, #ea515a38 78%)",
      },
      {
        slug: "forbes-councils",
        clientName: "Forbes Councils",
        logoSrc: "/images/Forbes_1.avif",
        logoAlt: "Forbes Councils",
        tags: ["Business", "Education"],
        description:
          "Forbes Councils partnered with Synergy Labs to elevate their members-only app, making it faster, more intuitive. We introduced essential tools like expert panels, event access, private messaging, and group discussions.",
        highlights: [
          { label: "16 weeks to launch", iconSrc: "/images/portfolio-white-weeks-to-launch.svg" },
          { label: "2K exclusive users", iconSrc: "/images/portfolio-white-people.svg" },
        ],
        imageSrc: "/images/Forbes-Image_1.avif",
        imageAlt: "Forbes Councils app screens",
        caseStudyHref: "/projects/casestudy/forbes-councils",
        theme: "dark",
        backgroundImage: "linear-gradient(#112134, #33629a)",
      },
      {
        slug: "open",
        clientName: "Open",
        logoSrc: "/images/Open-Logo.avif",
        logoAlt: "Open Logo",
        tags: ["Health", "Lifestyle"],
        description:
          "Open partnered with us to revamp their app with a fresh design and key performance improvements, creating a smoother and more modern user experience.",
        highlights: [
          { label: "8 weeks to launch", iconSrc: "/images/portfolio-white-weeks-to-launch.svg" },
          { label: "500k downloads", iconSrc: "/images/portfolio-white-downloads.svg" },
        ],
        imageSrc: "/images/Open-Iphone.avif",
        imageAlt: "iPhone screen with Open app",
        caseStudyHref: "/projects/casestudy/open",
        theme: "dark",
        backgroundImage: "linear-gradient(#000, #333)",
      },
    ],
  },

  howWeWork: {
    heading: "How we work",
    steps: [
      {
        number: "01",
        title: "Initial Call",
        description:
          "We’ll meet to discuss your project goals and make sure we have right team for your needs.",
      },
      {
        number: "02",
        title: "Discovery Phase",
        description:
          "We’ll give a project based cost and stick to that budget and timeline till the end.",
      },
      {
        number: "03",
        title: "Development & App Launch",
        description:
          "We will meticulously develop your app to meet your specific requirements, ensuring a seamless and user-friendly experience. Once the app is ready, we will handle the entire launch process.",
      },
    ],
  },

  whyUs: {
    heading: "Why us",
    rows: [
      { label: "Average timeline", otherAgencies: "6 months", synergyLabs: "10 weeks" },
      { label: "Proposal given in", otherAgencies: "1-2 weeks", synergyLabs: "1-2 days" },
      { label: "HQ", otherAgencies: "Overseas", synergyLabs: "US Based" },
      { label: "Talk to", otherAgencies: "Sales people", synergyLabs: "Product Consultant" },
      { label: "Flexibility", otherAgencies: "Bureaucratic approach", synergyLabs: "Boutique approach" },
      { label: "Budget type", otherAgencies: "Hourly", synergyLabs: "Scope based" },
    ],
  },

  reviews: {
    heading: "What people say about us",
    subheading:
      "Don't just take our word for it. See what out clients have been saying about working with Synergy Labs.",
    ctaButton: { label: "Contact us", href: "/contact" },
  },

  services: {
    heading: "So you just do apps? Nope, we do a lil more",
    items: [
      { title: "Web Apps", imageSrc: "/images/services-web-apps.svg", href: "/our-services/web-app-development" },
      { title: "Mobile Apps", imageSrc: "/images/services-mobile-apps.svg", href: "/our-services/app-development" },
      { title: "Staff Augmentation", imageSrc: "/images/services-staff-augmentation.svg", href: "/our-services/staff-augmentation" },
      { title: "Custom Software", imageSrc: "/images/services-custom-software.webp", href: "/our-services/ai-infusion" },
      { title: "Marketing Services", imageSrc: "/images/services-marketing-services.png", href: "/our-services/marketing-services" },
    ],
  },

  cta: {
    heading: "Ready to Start?",
    body:
      "Fill out our quick form and schedule a discovery meeting with our product expert and we will get you the best proposal in less than 48 hours!",
    ctaButton: { label: "Contact us", href: "/contact" },
  },

  locations: {
    heading: "Our Locations",
    moreLocationsLabel: "More locations",
    items: [
      { city: "Miami", address: "78 SW 7th St, Miami, FL 33130", isHeadquarters: true, imageSrc: "/images/FL.webp" },
      { city: "Dubai", address: "One Central 9th Floor -Trade Centre 2 - Dubai - UAE", imageSrc: "/images/imageForEntry25-aa1_1.avif" },
      { city: "Hartford", address: "200 Constitution Pl, Hartford, CT 06103", imageSrc: "/images/CT_1.webp" },
      { city: "San Francisco", address: "44 Montgomery St, San Francisco, CA 94104", imageSrc: "/images/SF.webp" },
      { city: "Qatar", address: "1st and 2nd floor, Iconoview, C Ring Rd, Doha, Qatar", imageSrc: "/images/Qatar.webp" },
      { city: "New York City", address: "445 Park Ave, Manhattan, NY 10022", imageSrc: "/images/NY.webp" },
      { city: "Austin", address: "600 Congress Ave. Austin, TX 78701", imageSrc: "/images/Austin-TX-Skyline_1.avif" },
      { city: "Riyadh", address: "Building No. 44, Ibn Katheer St, King Abdul Aziz, Riyadh 13334, Saudi Arabia", imageSrc: "/images/riyadh.webp" },
      { city: "London", address: "18 Finsbury Square, London EC2A 1AH, United Kingdom", imageSrc: "/images/London.webp" },
      { city: "Chicago", address: "515 N State St, Chicago, IL 60654, United States", imageSrc: "/images/chicago.webp" },
    ],
  },

  faq: {
    heading: "Frequently Asked Questions",
    items: [
      {
        question: "I’ve got an idea, where do I start?",
        answer:
          "Getting started is easy! Simply reach out to us by sharing your idea through our contact form. One of our team members will respond within one working day via email or phone to discuss your project in detail. We’re excited to help you turn your vision into reality!",
      },
      {
        question: "Why should we use SynergyLabs over another agency?",
        answer:
          "Choosing SynergyLabs means partnering with a top-tier boutique mobile app development agency that prioritizes your needs. Our team is dedicated to delivering high-quality, scalable, and cross-platform apps quickly and affordably. We focus on personalized service, ensuring that you work directly with senior talent throughout your project. Our commitment to innovation, client satisfaction, and transparent communication sets us apart from other agencies. With SynergyLabs, you can trust that your vision will be brought to life with expertise and care.",
      },
      {
        question: "How long will it take to build and launch my app?",
        answer:
          "We typically launch apps within 6 to 8 weeks, depending on the complexity and features of your project. Our streamlined development process ensures that you can bring your app to market quickly while still receiving a high-quality product.",
      },
      {
        question: "What platforms do you develop for?",
        answer:
          "Our cross-platform development method allows us to create both web and mobile applications simultaneously. This means your mobile app will be available on both iOS and Android, ensuring a broad reach and a seamless user experience across all devices. Our approach helps you save time and resources while maximizing your app's potential.",
      },
      {
        question: "What programming languages and frameworks do you use?",
        answer:
          "At SynergyLabs, we utilize a variety of programming languages and frameworks to best suit your project’s needs. For cross-platform development, we use Flutter or Flutterflow, which allows us to efficiently support web, Android, and iOS with a single codebase—ideal for projects with tight budgets. For native applications, we employ Swift for iOS and Kotlin for Android applications. For web applications, we combine frontend layout frameworks like Ant Design, or Material Design with React. On the backend, we typically use Laravel or Yii2 for monolithic projects, and Node.js for serverless architectures. Additionally, we can support various technologies, including Microsoft Azure, Google Cloud, Firebase, Amazon Web Services (AWS), React Native, Docker, NGINX, Apache, and more.",
      },
      {
        question: "How will I secure my app?",
        answer:
          "Security is a top priority for us. We implement industry-standard security measures, including data encryption, secure coding practices, and regular security audits, to protect your app and user data.",
      },
      {
        question: "Do you provide ongoing support, maintenance, and updates?",
        answer:
          "Yes, we offer ongoing support, maintenance, and updates for your app. After completing your project, you will receive up to 4 weeks of complimentary maintenance to ensure everything runs smoothly. Following this period, we provide flexible ongoing support options tailored to your needs, so you can focus on growing your business while we handle your app's maintenance and updates.",
      },
    ],
  },
};
