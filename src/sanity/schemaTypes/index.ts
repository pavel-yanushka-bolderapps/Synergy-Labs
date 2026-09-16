import { service } from "./service";
import { projects } from "./projects";
import { location } from "./location";
import { caseStudySections } from "./caseStudySections";

export const schemaTypes = [service, projects, location, ...caseStudySections];
