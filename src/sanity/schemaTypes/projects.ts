import {defineField, defineType} from "sanity";

export const projects = defineType({
    name: "project",
    title: "Project",
    type: "document",
    fields :[
        defineField({
            name: "title",
            title: "Title",
            type: "string",
            validation: (Rule) => Rule.required(),
        }),
        defineField({
            name: "description",
            title: "Description",
            type: "string",
            description: 'Test'
        })
    ]
})