# Co-authoring Markdown files

## Prompt

I'd like you to create a requirements document that captures the details for a new app feature of Notebook.md that allows multiple users to co-author Markdown files in real-time. Our original principles for building Notebook.md was that no documents would ever be stored in our service, and that leveraging your existing cloud providers for storage was key. I think co-authoring may require us to store documents on our service. Managing ACLs for co-auth users is too complicated for us to manage at those remote cloud services, so we likely want to introduce a storage type for Cloud that is stored in our service. I'll need you to think about this deeply and offer recommendations on how we address this change in our strategy (storing documents/files for this scenario) and suggest how we'd update the rest or our, including marketing materials on the site and our tag lines to ensure we don't get the wrong message across.

As it relates to the experience, I want you to evaluate whether or not our current implementation with TipTap for the editor is the right choice for co-authoring, or if we should use some other canvas (or build our own). Please give me the pros and cons of different choices you consider. For data storage, explain how our current stack choices would work, or if we should consider different technologies. I know Microsoft has build Fluid Framework for scenarios like this, so consider how that (or other open source technologies) could work

Another p.