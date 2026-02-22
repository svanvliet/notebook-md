

# Answers to Requirements Questions
1. We will need email server support for both scenarios, if you consider password reset often requires an email to be sent for reset links. Can we do both options for login, allow user to select magic link or create a password? Also, please capture how we’ll do email testing locally (or enable a dev mode way to get the link without email)

2. Yes, we should merge accounts when that situation arises.

3. I think individual consent should be sufficient, provided the app’s required access meets those requirements (e.g., accessing files and folders from OneDrive)

4. I’d like to have a persistent “remember me” feature, but I do want to follow best practices for token expiry. Implement the best approach for refreshing tokens and honoring token revocation, while also giving users a convenient timeframe when they click “remember me”. On the native apps, we should assume “remember me” by default when the log in.

5. Let’s remove iCloud as a source system. Those complexities are too much for this first version. 

6. All known Markdown file types, including .md, .mdx, and .txt, should be included. When a .txt file is opened, it should default to the editor view and display as plaintext. Media files, such as JPG, PNG, SVG, GIF, MP4, etc. should be supported.

7. Yes, it should support folder CRUD.

8. Let’s do a combination, user provides a URL or uploads to the workspace. If uploading to the workspace, create an assets subfolder relative to the folder in which the .md file lives where the uploaded media will be stored.

9. Yes, a user can add many workspaces from the same source. The workspace is a logical concept that can be attached to a source system, and we should share the source system connection between workspaces. In fact, let’s rename the workspace to the term Notebook. Notebook is the root item in the tree under which folders and notes (.md files) live and are organized. On reflection, workspaces is confusing.

10. Let’s introduce sharing as a future version idea. I don’t want to take on the security exposure of sharing access to someone’s content in a source system. This could lead to data exfiltration I don’t want to be accountable for.

11. For the first version, let’s go with the suggested option of working branch. If there are design considerations we should make now that will make it easier to switch later, please take those into account. But if they create too much complexity for now, we can skip. Either way, capture this in the future version notes of the requirements.

12.	Let’s squash on publish, that would result in less commit traffic to origin, right?

13.	Let’s do all public and private repos for now, but NOT for repos owned by a GitHub organization at this time.

14.	Yes, private as well

15.	Same as the answer to question #6. Only supported Markdown and common media file types.

16.	Let’s go with your recommendation, GFM as base with extensions for math and footnotes.

17.	Yes. We can have a keyboard hotkey combo to toggle.

18.	Yes.

19.	Yes.

20.	Yes.

21.	Yes, all common shortcuts that work correctly on Mac or PC.

22.	It should be collapsable so it’s a thin strip, and resizable. 

23.	Not for v1, although we’ll have split view support for a single document as per question 18.

24.	Yes.

25.	Not for v1.

26.	Yes, we should have toast notifications for system messages, etc.

27.	For v1, let’s keep settings synced across accounts.

28.	Global only for now.

29.	Not configurable in v1.

30.	Can I keep it at Godaddy for now so you can use APIs from them to update DNS when needed? If not, I can manually change things for v1. Otherwise, I can move the domain’s DNS servers to Azure DNS if you suggest to do so.

31.	Local development is one, production is another. Is it possible to deploy to production with canary instead of a full staging environment? Also, the client app will need a “dev mode” where I can configure which environment I’m running in. That should be enabled by default when running the app locally but should also be enabled for certain accounts that are flagged as “dev” mode. To that end, we’ll need to create an administration/management interface for reviewing accounts, system health, etc. Let’s make sure we capture the requirements for that as another web app we’d deploy to the fleet. We don’t need to access that admin console from the native client, only from the web. Please document the requirements for that in our main doc.

32.	For v1, basic health checks and uptime monitoring are important. But, if there are low cost tools for monitoring/observability products we can deploy, then let’s do that.

33.	We should have plans for an HA/DR strategy that includes backups. Please propose how we’d do that, and ask follow-up questions as you need to.

34.	I want to balance monthly costs to the bare minimum, but don’t have a price target yet. Please consider those costs when selecting Azure managed offerings vs rolling our own containers for the same service (e.g. observability). Also, please estimate the costs of maintaining the fleet in product. You can assume a single global region deployment and give me some estimates for weekly active user tranches by 100, 1,000, 100,000, and 1,000,000 WAU.

35.	For now, v1 is free. Although please capture some considerations of monetization opportunities for v2 and beyond at the end of the requirements document.

36.	For MVP, let’s remove iCloud (as previously mentioned), and also defer the desktop apps. We should make sure they’ll work based on the choices we make now, though.

37.	Target users are digital natives across developers, knowledge workers, and students. I don’t care about enterprise IT adoption, but I anticipate digital native employees of enterprises will use the app.

38.	I really like Tailwind!

39.	The app should support multiple languages, but we’ll do English only for v1. Let’s make sure we plan for that in what we build so we can add other language support as a fast-follow.

40.	Yes. Since this app will be published by me individually, can you generate boilerplate versions of these that limit my liability?

Please feel free to append any other questions you have to the end of requirements-questions.md, continuing the numbering scheme so I can answer if you need it.

## Answers to Follow-Up Questions (Round 2)

41.	Let’s have a CLI command that promotes an existing account to admin. I don’t want to leave a backdoor with a seed user that can be admin in production. For local development, we can have a database seed script for creating a default admin account; I just don’t want that in prod.

42.	All account types can be used to access the admin console, but we should include 2FA for email/password login. For e.g., if they use a password, we should also require a magic link OR emailed 2FA code. On reflection, we could make 2FA optional for all email/password users? You decide the best design and capture the requirement updates.

43.	Let’s use the GitHub App approach.

44.	 Let’s make this an account setting that the user can set. “Delete branch on merge” as a check box or something like that in settings.

45.	Let’s limit to 10MB per file per now.

46.	Let’s render the file inline as a preview.

47.	Let’s do East US 2

48.	noreply@notebookmd.io

49.	The code will be published to GitHub. I’d like to make the repo public, but don’t want anyone to be able to publish to my Azure prod environment. What should I do?

50.	I have a legal entity called Van Vliet Ventures, LLC. We can use that for the terms.

51.	Yes, I want all those stats. I’d like to use standards-based tools, so whatever you suggest is the best option for this.

## Follow-Up Questions (Round 3)

52.	Let’s use Notebook.md

53.	Yes.

54.	No. OAuth is sufficient for v1. Let’s note that we may want to enable that later.

55.	US with property privacy policy disclosures

56.	Let’s do a simple customer banner for now.

57.	Let’s do the latter.

Upon reflection, I do not want to have the GitHub repo be public for now. I’ll keep it private, so please update the requirements to reflect that. I still want to institute the PR rules you outlined and the environment settings you suggested if you believe they’re still useful when the repo is private (perhaps sets us up for the future if I switch to public?) I also want the CI/CD when I push a v* tag.