import type { ServicesPageContent } from "../lib/types";
import { home } from "./home";

export const ourServicesPage: ServicesPageContent = {
  heading: "Our Services",
  subheading: "While it's not our full portfolio, these are our top projects",
  items: home.services.items,
};
