import { service } from "./service";
import { projects } from "./projects";
import { location } from "./location";
import { locationService } from "./locationService";
import { locationIndustry } from "./locationIndustry";
import { locationTechnology } from "./locationTechnology";
import { blogAuthor } from "./blogAuthor";
import { blogPost } from "./blogPost";
import { clutchLanding } from "./clutchLanding";
import { caseStudySections } from "./caseStudySections";

export const schemaTypes = [
  service,
  projects,
  location,
  locationService,
  locationIndustry,
  locationTechnology,
  blogAuthor,
  blogPost,
  clutchLanding,
  ...caseStudySections,
];
