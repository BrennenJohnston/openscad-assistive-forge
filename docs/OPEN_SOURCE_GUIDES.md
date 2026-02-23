# Open Source Guides

> Open source software is made by people just like you. Learn how to launch and grow your project.

*Source: [GitHub Open Source Guides](https://opensource.guide) -- Content licensed under [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/).*

---

## Table of Contents

1. [Security Best Practices for Your Project](#1-security-best-practices-for-your-project)
2. [Maintaining Balance for Open Source Maintainers](#2-maintaining-balance-for-open-source-maintainers)
3. [How to Contribute to Open Source](#3-how-to-contribute-to-open-source)
4. [Starting an Open Source Project](#4-starting-an-open-source-project)
5. [Finding Users for Your Project](#5-finding-users-for-your-project)
6. [Building Welcoming Communities](#6-building-welcoming-communities)
7. [Best Practices for Maintainers](#7-best-practices-for-maintainers)
8. [Leadership and Governance](#8-leadership-and-governance)
9. [Getting Paid for Open Source Work](#9-getting-paid-for-open-source-work)
10. [Your Code of Conduct](#10-your-code-of-conduct)
11. [Open Source Metrics](#11-open-source-metrics)
12. [The Legal Side of Open Source](#12-the-legal-side-of-open-source)
13. [Legal Disclaimer and Notices](#13-legal-disclaimer-and-notices)

---

## 1. Security Best Practices for Your Project

*Strengthen your project's future by building trust through essential security practices -- from MFA and code scanning to safe dependency management and private vulnerability reporting.*

Bugs and new features aside, a project's longevity hinges not only on its usefulness but also on the trust it earns from its users. Strong security measures are important to keep this trust alive. Here are some important actions you can take to significantly improve your project's security.

### 1.1 Ensure All Privileged Contributors Have Enabled Multi-Factor Authentication (MFA)

**A malicious actor who manages to impersonate a privileged contributor to your project will cause catastrophic damages.**

Once they obtain the privileged access, this actor can modify your code to make it perform unwanted actions (e.g. mine cryptocurrency), or can distribute malware to your users' infrastructure, or can access private code repositories to exfiltrate intellectual property and sensitive data, including credentials to other services.

MFA provides an additional layer of security against account takeover. Once enabled, you have to log in with your username and password and provide another form of authentication that only you know or have access to.

### 1.2 Secure Your Code as Part of Your Development Workflow

**Security vulnerabilities in your code are cheaper to fix when detected early in the process than later, when they are used in production.**

Use a Static Application Security Testing (SAST) tool to detect security vulnerabilities in your code. These tools are operating at code level and don't need an executing environment, and therefore can be executed early in the process, and can be seamlessly integrated in your usual development workflow, during the build or during the code review phases.

It's like having a skilled expert look over your code repository, helping you find common security vulnerabilities that could be hiding in plain sight as you code.

**How to choose your SAST tool?**

- Check the license: Some tools are free for open source projects. For example GitHub CodeQL or SemGrep.
- Check the coverage for your language(s).
- Select one that easily integrates with the tools you already use, with your existing process. For example, it's better if the alerts are available as part of your existing code review process and tool, rather than going to another tool to see them.
- Beware of False Positives! You don't want the tool to slow you down for no reason!
- Check the features: some tools are very powerful and can do taint tracking (example: GitHub CodeQL), some propose AI-generated fix suggestions, some make it easier to write custom queries (example: SemGrep).

### 1.3 Don't Share Your Secrets

**Sensitive data, such as API keys, tokens, and passwords, can sometimes accidentally get committed to your repository.**

Imagine this scenario: You are the maintainer of a popular open-source project with contributions from developers worldwide. One day, a contributor unknowingly commits to the repository some API keys of a third-party service. Days later, someone finds these keys and uses them to get into the service without permission. The service is compromised, users of your project experience downtime, and your project's reputation takes a hit. As the maintainer, you're now faced with the daunting tasks of revoking compromised secrets, investigating what malicious actions the attacker could have performed with this secret, notifying affected users, and implementing fixes.

To prevent such incidents, "secret scanning" solutions exist to help you detect those secrets in your code. Some tools like GitHub Secret Scanning, and Trufflehog by Truffle Security can prevent you from pushing them to remote branches in the first place, and some tools will automatically revoke some secrets for you.

### 1.4 Check and Update Your Dependencies

**Dependencies in your project can have vulnerabilities that compromise the security of your project. Manually keeping dependencies up to date can be a time-consuming task.**

Picture this: a project built on the sturdy foundation of a widely-used library. The library later finds a big security problem, but the people who built the application using it don't know about it. Sensitive user data is left exposed when an attacker takes advantage of this weakness, swooping in to grab it. This is not a theoretical case. This is exactly what happened to Equifax in 2017: They failed to update their Apache Struts dependency after the notification that a severe vulnerability was detected. It was exploited, and the infamous Equifax breach affected 144 million users' data.

To prevent such scenarios, Software Composition Analysis (SCA) tools such as Dependabot and Renovate automatically check your dependencies for known vulnerabilities published in public databases such as the NVD or the GitHub Advisory Database, and then creates pull requests to update them to safe versions. Staying up-to-date with the latest safe dependency versions safeguards your project from potential risks.

### 1.5 Understand and Manage Open Source License Risks

**Open source licenses come with terms and ignoring them can lead to legal and reputational risks.**

Using open source dependencies can speed up development, but each package includes a license that defines how it can be used, modified, or distributed. Some licenses are permissive, while others (like AGPL or SSPL) impose restrictions that may not be compatible with your project's goals or your users' needs.

To avoid these pitfalls, consider including automated license checks as part of your development workflow. These checks can help identify incompatible licenses early in the process, preventing problematic dependencies from being introduced into your project.

Another powerful approach is generating a Software Bill of Materials (SBOM). An SBOM lists all components and their metadata (including licenses) in a standardized format. It offers clear visibility into your software supply chain and helps surface licensing risks proactively.

### 1.6 Avoid Unwanted Changes with Protected Branches

**Unrestricted access to your main branches can lead to accidental or malicious changes that may introduce vulnerabilities or disrupt the stability of your project.**

A new contributor gets write access to the main branch and accidentally pushes changes that have not been tested. A dire security flaw is then uncovered, courtesy of the latest changes. To prevent such issues, branch protection rules ensure that changes cannot be pushed or merged into important branches without first undergoing reviews and passing specified status checks.

### 1.7 Make It Easy (and Safe) to Report Security Issues

**It's a good practice to make it easy for your users to report bugs, but the big question is: when this bug has a security impact, how can they safely report them to you without putting a target on you for malicious hackers?**

Picture this: A security researcher discovers a vulnerability in your project but finds no clear or secure way to report it. Without a designated process, they might create a public issue or discuss it openly on social media. Even if they are well-intentioned and offer a fix, if they do it with a public pull request, others will see it before it's merged! This public disclosure will expose the vulnerability to malicious actors before you have a chance to address it, potentially leading to a zero-day exploit, attacking your project and its users.

#### Security Policy

To avoid this, publish a security policy. A security policy, defined in a `SECURITY.md` file, details the steps for reporting security concerns, creating a transparent process for coordinated disclosure, and establishing the project team's responsibilities for addressing reported issues.

This security policy can be as simple as "Please don't publish details in a public issue or PR, send us a private email at security@example.com", but can also contain other details such as when they should expect to receive an answer from you.

#### Private Vulnerability Reporting

On some platforms, you can streamline and strengthen your vulnerability management process, from intake to broadcast, with private issues. On GitLab, this can be done with private issues. On GitHub, this is called private vulnerability reporting (PVR). PVR enables maintainers to receive and address vulnerability reports, all within the GitHub platform. GitHub will automatically create a private fork to write the fixes, and a draft security advisory. All of this remains confidential until you decide to disclose the issues and release the fixes.

#### Define Your Threat Model

Before security researchers can report issues effectively, they need to understand what risks are in scope. A lightweight threat model can help define your project's boundaries, expected behavior, and assumptions.

A threat model doesn't need to be complex. Even a simple document outlining what your project does, what it trusts, and how it could be misused goes a long way. A great example is the Node.js threat model, which clearly defines what is and isn't considered a vulnerability in the project's context.

If you're new to this, the OWASP Threat Modeling Process offers a helpful introduction to build your own.

### 1.8 Prepare a Lightweight Incident Response Process

**Having a basic incident response plan helps you stay calm and act efficiently, ensuring the safety of your users and consumers.**

> A vulnerability is basically a flaw, a security misconfiguration or a weak point in our system that can be exploited by third parties to behave in unintended ways.
> -- @UlisesGascon, "What is a Vulnerability and What's Not?"

Your process doesn't have to be complex. At minimum, define:

- Who reviews and triages security reports or alerts
- How severity is evaluated and how mitigation decisions are made
- What steps you take to prepare a fix and coordinate disclosure
- How you notify affected users, contributors, or downstream consumers

For inspiration, the Express.js Security WG provides a simple but effective example of an open source incident response plan.

### 1.9 Treat Security as a Team Effort

**Security isn't a solo responsibility. It works best when shared across your project's community.**

Here are a few ways to make security a team sport:

- **Assign clear roles:** Know who handles vulnerability reports, who reviews dependency updates, and who approves security patches.
- **Limit access using the principle of least privilege:** Only give write or admin access to those who truly need it and review permissions regularly.
- **Invest in education:** Encourage contributors to learn about secure coding practices, common vulnerability types, and how to use your tools.
- **Foster diversity and collaboration:** A heterogeneous team brings a wider set of experiences, threat awareness, and creative problem-solving skills.
- **Engage upstream and downstream:** Your dependencies can affect your security and your project affects others. Participate in coordinated disclosure with upstream maintainers, and keep downstream users informed when vulnerabilities are fixed.

Security is an ongoing process, not a one-time setup. By involving your community, encouraging secure practices, and supporting each other, you build a stronger, more resilient project and a safer ecosystem for everyone.

### Conclusion

These few steps might seem easy or basic to you, but they go a long way to make your project more secure for its users, because they will provide protection against the most common issues.

Security isn't static. Revisit your processes from time to time. As your project grows, so do your responsibilities and your attack surface.

*This guide was written by @nanzggits & @xcorail with contributions from @JLLeitschuh, @intrigus-lgtm, @UlisesGascon + many others!*

---

## 2. Maintaining Balance for Open Source Maintainers

*Tips for self-care and avoiding burnout as a maintainer.*

As an open source project grows in popularity, it becomes important to set clear boundaries to help you maintain balance to stay refreshed and productive for the long run.

To gain insights into the experiences of maintainers and their strategies for finding balance, we ran a workshop with 40 members of the Maintainer Community, allowing us to learn from their firsthand experiences with burnout in open source and the practices that have helped them maintain balance in their work. This is where the concept of personal ecology comes into play.

So, what is personal ecology? As described by the Rockwood Leadership Institute, it involves "maintaining balance, pacing, and efficiency to sustain our energy over a lifetime." This framed our conversations, helping maintainers recognize their actions and contributions as parts of a larger ecosystem that evolves over time. Burnout, a syndrome resulting from chronic workplace stress as defined by the WHO, is not uncommon among maintainers. This often leads to a loss of motivation, an inability to focus, and a lack of empathy for the contributors and community you work with.

> I was unable to focus or start on a task. I had a lack of empathy for users.
> -- @gabek, maintainer of the Owncast live streaming server, on the impact of burnout on his open source work

By embracing the concept of personal ecology, maintainers can proactively avoid burnout, prioritize self-care, and uphold a sense of balance to do their best work.

### 2.1 Tips for Self-Care and Avoiding Burnout

#### Identify your motivations for working in open source

Take time to reflect on what parts of open source maintenance energize you. Understanding your motivations can help you prioritize the work in a way that keeps you engaged and ready for new challenges. Whether it's the positive feedback from users, the joy of collaborating and socializing with the community, or the satisfaction of diving into the code, recognizing your motivations can help guide your focus.

#### Reflect on what causes you to get out of balance and stressed out

It's important to understand what causes us to get burned out. Here are a few common themes we saw among open source maintainers:

- **Lack of positive feedback:** Users are far more likely to reach out when they have a complaint. If everything works great, they tend to stay silent. It can be discouraging to see a growing list of issues without the positive feedback showing how your contributions are making a difference.

> Sometimes it feels a bit like shouting into the void and I find that feedback really energizes me. We have lots of happy but quiet users.
> -- @thisisnic, maintainer of Apache Arrow

- **Not saying 'no':** It can be easy to take on more responsibilities than you should on an open source project. Whether it's from users, contributors, or other maintainers -- we can't always live up to their expectations.

> I found I was taking on more than one should and having to do the job of multiple people, like commonly done in FOSS.
> -- @agnostic-apollo, maintainer of Termux, on what causes burnout in their work

- **Working alone:** Being a maintainer can be incredibly lonely. Even if you work with a group of maintainers, the past few years have been difficult for convening distributed teams in-person.

> Especially since COVID and working from home it's harder to never see anybody or talk to anybody.
> -- @gabek, maintainer of the Owncast live streaming server

- **Not enough time or resources:** This is especially true for volunteer maintainers who have to sacrifice their free time to work on a project.

> [I would like to have] more financial support, so that I can focus on the open source work without burning through my savings and knowing I'll have to do a lot of contracting to make up for it later.
> -- open source maintainer

- **Conflicting demands:** Open source is full of groups with different motivations, which can be difficult to navigate. If you're paid to do open source, your employer's interests can sometimes be at odds with the community.

#### Watch out for signs of burnout

Can you keep up your pace for 10 weeks? 10 months? 10 years?

There are tools like the Burnout Checklist from @shaunagm that can help you reflect on your current pace and see if there are any adjustments you can make. Some maintainers also use wearable technology to track metrics like sleep quality and heart rate variability (both linked to stress).

#### What would you need to continue sustaining yourself and your community?

This will look different for each maintainer, and will change depending on your phase of life and other external factors. But here are a few themes we heard:

- **Lean on the community:** Delegation and finding contributors can alleviate the workload. Having multiple points of contact for a project can help you take a break without worrying. Connect with other maintainers and the wider community -- in groups like the Maintainer Community. This can be a great resource for peer support and learning.

- **Explore funding:** Whether you're looking for some pizza money, or trying to go full time open source, there are many resources to help! As a first step, consider turning on GitHub Sponsors to allow others to sponsor your open source work. If you're thinking about making the jump to full-time, apply for the next round of GitHub Accelerator.

> I was on a podcast a while ago and we were chatting about open source maintenance and sustainability. I found that even a small number of people supporting my work on GitHub helped me make a quick decision not to sit in front of a game but instead to do one little thing with open source.
> -- @mansona, maintainer of EmberJS

- **Use tools:** Explore tools like GitHub Copilot and GitHub Actions to automate mundane tasks and free up your time for more meaningful contributions.

- **Rest and recharge:** Make time for your hobbies and interests outside of open source. Take weekends off to unwind and rejuvenate -- and set your GitHub status to reflect your availability! A good night's sleep can make a big difference in your ability to sustain your efforts long-term.

> I'm finding more opportunity to sprinkle 'moments of creativity' in the middle of the day rather than trying to switch off in the evening.
> -- @danielroe, maintainer of Nuxt

- **Set boundaries:** You can't say yes to every request. This can be as simple as saying, "I can't get to that right now and I do not have plans to in the future," or listing out what you're interested in doing and not doing in the README. For instance, you could say: "I only merge PRs which have clearly listed reasons why they were made," or, "I only review issues on alternate Thursdays from 6-7 pm."

> To meaningfully trust others on these axes, you cannot be someone who says yes to every request. In doing so, you maintain no boundaries, professionally or personally, and will not be a reliable coworker.
> -- @mikemcquaid, maintainer of Homebrew on Saying No

Learn to be firm in shutting down toxic behavior and negative interactions. It's okay to not give energy to things you don't care about.

> My software is gratis, but my time and attention is not.
> -- @IvanSanchez, maintainer of Leaflet

Remember, personal ecology is an ongoing practice that will evolve as you progress in your open source journey. By prioritizing self-care and maintaining a sense of balance, you can contribute to the open source community effectively and sustainably, ensuring both your well-being and the success of your projects for the long run.

### 2.2 Additional Resources

- Maintainer Community
- The social contract of open source, Brett Cannon
- Uncurled, Daniel Stenberg
- How to deal with toxic people, Gina Haeussge
- SustainOSS
- Rockwood Art of Leadership
- Saying No
- Workshop agenda was remixed from Mozilla's Movement Building from Home series

*This guide was written by @abbycabs with contributions from @agnostic-apollo, @AndreaGriffiths11, @antfu, @anthonyronda, @CBID2, @Cli4d, @confusedTechie, @danielroe, @Dexters-Hub, @eddiejaoude, @Eugeny, @ferki, @gabek, @geromegrignon, @hynek, @IvanSanchez, @karasowles, @KoolTheba, @leereilly, @ljharb, @nightlark, @plarson3427, @Pradumnasaraf, @RichardLitt, @rrousselGit, @sansyrox, @schlessera, @shyim, @smashah, @ssalbdivad, @The-Compiler, @thehale, @thisisnic, @tudoramariei, @UlisesGascon, @waldyrious + many others!*

---

## 3. How to Contribute to Open Source

*Want to contribute to open source? A guide to making open source contributions, for first-timers and veterans.*

### 3.1 Why Contribute to Open Source?

> Working on [freenode] helped me earn many of the skills I later used for my studies in university and my actual job. I think working on open source projects helps me as much as it helps the project!
> -- @errietta, "Why I love contributing to open source software"

Contributing to open source can be a rewarding way to learn, teach, and build experience in just about any skill you can imagine.

Why do people contribute to open source? Plenty of reasons!

**Improve software you rely on.** Lots of open source contributors start by being users of software they contribute to. When you find a bug in open source software you use, you may want to look at the source to see if you can patch it yourself. If that's the case, then contributing the patch back is the best way to ensure that your friends (and yourself when you update to the next release) will be able to benefit from it.

**Improve existing skills.** Whether it's coding, user interface design, graphic design, writing, or organizing, if you're looking for practice, there's a task for you on an open source project.

**Meet people who are interested in similar things.** Open source projects with warm, welcoming communities keep people coming back for years. Many people form lifelong friendships through their participation in open source, whether it's running into each other at conferences or late-night online chats about burritos.

**Find mentors and teach others.** Working with others on a shared project means you'll have to explain how you do things, as well as ask other people for help. The acts of learning and teaching can be a fulfilling activity for everyone involved.

**Build public artifacts that help you grow a reputation (and a career).** By definition, all of your open source work is public, which means you get free examples to take anywhere as a demonstration of what you can do.

**Learn people skills.** Open source offers opportunities to practice leadership and management skills, such as resolving conflicts, organizing teams of people, and prioritizing work.

**It's empowering to make changes, even small ones.** You don't have to become a lifelong contributor to enjoy participating in open source. Have you ever seen a typo on a website, and wished someone would fix it? On an open source project, you can do just that. Open source helps people feel agency over their lives and how they experience the world, and that in itself is gratifying.

### 3.2 What It Means to Contribute

If you're a new open source contributor, the process can be intimidating. How do you find the right project? What if you don't know how to code? What if something goes wrong?

Not to worry! There are all sorts of ways to get involved with an open source project, and a few tips will help you get the most out of your experience.

#### You don't have to contribute code

A common misconception about contributing to open source is that you need to contribute code. In fact, it's often the other parts of a project that are most neglected or overlooked. You'll do the project a huge favor by offering to pitch in with these types of contributions!

> I've been renowned for my work on CocoaPods, but most people don't know that I actually don't do any real work on the CocoaPods tool itself. My time on the project is mostly spent doing things like documentation and working on branding.
> -- @orta, "Moving to OSS by default"

**Do you like planning events?**
- Organize workshops or meetups about the project
- Organize the project's conference (if they have one)
- Help community members find the right conferences and submit proposals for speaking

**Do you like to design?**
- Restructure layouts to improve the project's usability
- Conduct user research to reorganize and refine the project's navigation or menus
- Put together a style guide to help the project have a consistent visual design
- Create art for t-shirts or a new logo

**Do you like to write?**
- Write and improve the project's documentation
- Curate a folder of examples showing how the project is used
- Start a newsletter for the project, or curate highlights from the mailing list
- Write tutorials for the project
- Write a translation for the project's documentation

> Seriously, documentation is mega-important. The documentation so far has been great and has been a killer feature of Babel. There are sections that could certainly use some work and even the addition of a paragraph here or there is extremely appreciated.
> -- @kittens, "Call for contributors"

**Do you like organizing?**
- Link to duplicate issues, and suggest new issue labels, to keep things organized
- Go through open issues and suggest closing old ones
- Ask clarifying questions on recently opened issues to move the discussion forward

**Do you like to code?**
- Find an open issue to tackle
- Ask if you can help write a new feature
- Automate project setup
- Improve tooling and testing

**Do you like helping people?**
- Answer questions about the project on e.g., Stack Overflow or Reddit
- Answer questions for people on open issues
- Help moderate the discussion boards or conversation channels

**Do you like helping others code?**
- Review code on other people's submissions
- Write tutorials for how a project can be used
- Offer to mentor another contributor

**You don't just have to work on software projects!** While "open source" often refers to software, you can collaborate on just about anything. There are books, recipes, lists, and classes that get developed as open source projects.

### 3.3 Orienting Yourself to a New Project

> If you go to an issue tracker and things seem confusing, it's not just you. These tools require a lot of implicit knowledge, but people can help you navigate it and you can ask them questions.
> -- @shaunagm, "How to Contribute to Open Source"

For anything more than a typo fix, contributing to open source is like walking up to a group of strangers at a party. If you start talking about llamas, while they were deep in a discussion about goldfish, they'll probably look at you a little strangely.

Before jumping in blindly with your own suggestions, start by learning how to read the room. Doing so increases the chances that your ideas will be noticed and heard.

#### Anatomy of an open source project

Every open source community is different. Spending years on one open source project means you've gotten to know one open source project. Move to a different project, and you might find the vocabulary, norms, and communication styles are completely different.

That said, many open source projects follow a similar organizational structure. Understanding the different community roles and overall process will help you get quickly oriented to any new project.

A typical open source project has the following types of people:

- **Author:** The person/s or organization that created the project
- **Owner:** The person/s who has administrative ownership over the organization or repository (not always the same as the original author)
- **Maintainers:** Contributors who are responsible for driving the vision and managing the organizational aspects of the project (They may also be authors or owners of the project.)
- **Contributors:** Everyone who has contributed something back to the project
- **Community Members:** People who use the project. They might be active in conversations or express their opinion on the project's direction

Bigger projects may also have subcommittees or working groups focused on different tasks, such as tooling, triage, community moderation, and event organizing.

A project also has documentation. These files are usually listed in the top level of a repository:

- **LICENSE:** By definition, every open source project must have an open source license. If the project does not have a license, it is not open source.
- **README:** The README is the instruction manual that welcomes new community members to the project. It explains why the project is useful and how to get started.
- **CONTRIBUTING:** Whereas READMEs help people use the project, contributing docs help people contribute to the project. It explains what types of contributions are needed and how the process works.
- **CODE_OF_CONDUCT:** The code of conduct sets ground rules for participants' behavior associated and helps to facilitate a friendly, welcoming environment.
- **Other documentation:** There might be additional documentation, such as tutorials, walkthroughs, or governance policies, especially on bigger projects.

Finally, open source projects use the following tools to organize discussion:

- **Issue tracker:** Where people discuss issues related to the project.
- **Pull/Merge requests:** Where people discuss and review changes that are in progress.
- **Discussion forums or mailing lists:** Some projects may use these channels for conversational topics.
- **Synchronous chat channel:** Some projects use chat channels (such as Slack or IRC) for casual conversation, collaboration, and quick exchanges.

### 3.4 Finding a Project to Contribute To

Now that you've figured out how open source projects work, it's time to find a project to contribute to!

If you've never contributed to open source before, take some advice from U.S. President John F. Kennedy, who once said, *"Ask not what your country can do for you - ask what you can do for your country."*

Contributing to open source happens at all levels, across projects. You don't need to overthink what exactly your first contribution will be, or how it will look.

Instead, start by thinking about the projects you already use, or want to use. The projects you'll actively contribute to are the ones you find yourself coming back to.

Within those projects, whenever you catch yourself thinking that something could be better or different, act on your instinct.

Open source isn't an exclusive club; it's made by people just like you. "Open source" is just a fancy term for treating the world's problems as fixable.

According to a study conducted by Igor Steinmacher and other Computer Science researchers, 28% of casual contributions to open source are documentation, such as typo fixes, reformatting, or writing a translation.

If you're looking for existing issues you can fix, every open source project has a `/contribute` page that highlights beginner-friendly issues you can start out with. Navigate to the main page of the repository on GitHub, and add `/contribute` at the end of the URL.

You can also use one of the following resources to help you discover and contribute to new projects:

- GitHub Explore
- Open Source Friday
- First Timers Only
- CodeTriage
- 24 Pull Requests
- Up For Grabs
- First Contributions
- SourceSort
- OpenSauced
- GitLab Explore

#### A checklist before you contribute

When you've found a project you'd like to contribute to, do a quick scan to make sure that the project is suitable for accepting contributions.

**Meets the definition of open source:**
- Does it have a license? Usually, there is a file called LICENSE in the root of the repository.

**Project actively accepts contributions:**
- Look at the commit activity on the main branch.
- When was the latest commit?
- How many contributors does the project have?
- How often do people commit?
- How many open issues are there?
- Do maintainers respond quickly to issues when they are opened?
- Is there active discussion on the issues?
- Are the issues recent?
- Are issues getting closed?

**Now do the same for the project's pull requests:**
- How many open pull/merge requests are there?
- Do maintainers respond quickly to pull requests when they are opened?
- Is there active discussion on the pull requests?
- Are the pull requests recent?
- How recently were any pull requests merged?

**Project is welcoming:**
- Do the maintainers respond helpfully to questions in issues?
- Are people friendly in the issues, discussion forum, and chat?
- Do pull requests get reviewed?
- Do maintainers thank people for their contributions?

> Whenever you see a long thread, spot check responses from core developers coming late in the thread. Are they summarizing constructively, and taking steps to bring the thread to a decision while remaining polite? If you see a lot of flame wars going on, that's often a sign that energy is going into argument instead of into development.
> -- @kfogel, *Producing OSS*

### 3.5 How to Submit a Contribution

You've found a project you like, and you're ready to make a contribution. Finally! Here's how to get your contribution in the right way.

#### Communicating effectively

Whether you're a one-time contributor or trying to join a community, working with others is one of the most important skills you'll develop in open source.

Before you open an issue or pull request, or ask a question in chat, keep these points in mind to help your ideas come across effectively:

**Give context.** Help others get quickly up to speed. If you're running into an error, explain what you're trying to do and how to reproduce it. If you're suggesting a new idea, explain why you think it'd be useful to the project (not just to you!).

**Do your homework beforehand.** It's OK not to know things, but show that you tried. Before asking for help, be sure to check a project's README, documentation, issues (open or closed), mailing list, and search the internet for an answer.

**Keep requests short and direct.** Much like sending an email, every contribution, no matter how simple or helpful, requires someone else's review. Many projects have more incoming requests than people available to help. Be concise.

**Keep all communication public.** Although it's tempting, don't reach out to maintainers privately unless you need to share sensitive information (such as a security issue or serious conduct violation). When you keep the conversation public, more people can learn and benefit from your exchange.

**It's okay to ask questions (but be patient!).** Everybody was new to the project at some point, and even experienced contributors need to get up to speed when they look at a new project. By the same token, even longtime maintainers are not always familiar with every part of the project.

**Respect community decisions.** Your ideas may differ from the community's priorities or vision. They may offer feedback or decide not to pursue your idea. While you should discuss and look for compromise, maintainers have to live with your decision longer than you will. If you disagree with their direction, you can always work on your own fork or start your own project.

**Above all, keep it classy.** Open source is made up of collaborators from all over the world. Context gets lost across languages, cultures, geographies, and time zones. In addition, written communication makes it harder to convey a tone or mood. Assume good intentions in these conversations.

#### Gathering context

Before doing anything, do a quick check to make sure your idea hasn't been discussed elsewhere. Skim the project's README, issues (open and closed), mailing list, and Stack Overflow. You don't have to spend hours going through everything, but a quick search for a few key terms goes a long way.

If the project is on GitHub, you'll likely communicate by doing the following:

- **Raising an Issue:** These are like starting a conversation or discussion
- **Pull requests** are for starting work on a solution.
- **Communication Channels:** If the project has a designated Discord, IRC, or Slack channel, consider starting a conversation or asking for clarification about your contribution.

#### Opening an issue

You should usually open an issue in the following situations:

- Report an error you can't solve yourself
- Discuss a high-level topic or idea (for example, community, vision or policies)
- Propose a new feature or other project idea

Tips for communicating on issues:

- If you see an open issue that you want to tackle, comment on the issue to let people know you're on it.
- If an issue was opened a while ago, it's possible that it's being addressed somewhere else, or has already been resolved, so comment to ask for confirmation before starting work.
- If you opened an issue, but figured out the answer later on your own, comment on the issue to let people know, then close the issue.

#### Opening a pull request

You should usually open a pull request in the following situations:

- Submit small fixes such as a typo, a broken link or an obvious error.
- Start work on a contribution that was already asked for, or that you've already discussed, in an issue.

A pull request doesn't have to represent finished work. It's usually better to open a pull request early on, so others can watch or give feedback on your progress. Just open it as a "draft" or mark as a "WIP" (Work in Progress).

If the project is on GitHub, here's how to submit a pull request:

- **Fork the repository** and clone it locally. Connect your local to the original "upstream" repository by adding it as a remote. Pull in changes from "upstream" often so that you stay up to date so that when you submit your pull request, merge conflicts will be less likely.
- **Create a branch** for your edits.
- **Reference any relevant issues** or supporting documentation in your PR (for example, "Closes #37.")
- **Include screenshots** of the before and after if your changes include differences in HTML/CSS.
- **Test your changes!** Run your changes against any existing tests if they exist and create new ones when needed.
- **Contribute in the style of the project** to the best of your abilities. This may mean using indents, semi-colons or comments differently than you would in your own repository.

### 3.6 What Happens After You Submit Your Contribution

**You don't get a response.** If you haven't gotten a response in over a week, it's fair to politely respond in that same thread, asking someone for a review. Don't reach out to that person privately; remember that public communication is vital to open source projects. If you give a polite reminder and still do not receive a response, it's possible that nobody will ever respond. It's not a great feeling, but don't let that discourage you!

**Someone requests changes to your contribution.** It's common that you'll be asked to make changes to your contribution, whether that's feedback on the scope of your idea, or changes to your code. When someone requests changes, be responsive. They've taken the time to review your contribution. Opening a PR and walking away is bad form.

**Your contribution doesn't get accepted.** Your contribution may or may not be accepted in the end. Hopefully you didn't put too much work into it already. If you're not sure why it wasn't accepted, it's perfectly reasonable to ask the maintainer for feedback and clarification. Ultimately, however, you'll need to respect that this is their decision. Don't argue or get hostile. You're always welcome to fork and work on your own version if you disagree!

**Your contribution gets accepted.** Hooray! You've successfully made an open source contribution!

Whether you just made your first open source contribution, or you're looking for new ways to contribute, we hope you're inspired to take action. Even if your contribution wasn't accepted, don't forget to say thanks when a maintainer put effort into helping you. Open source is made by people like you: one issue, pull request, comment, or high-five at a time.

---

## 4. Starting an Open Source Project

*Learn more about the world of open source and get ready to launch your own project.*

### 4.1 The "What" and "Why" of Open Source

So you're thinking about getting started with open source? Congratulations! The world appreciates your contribution. Let's talk about what open source is and why people do it.

#### What does "open source" mean?

When a project is open source, that means anybody is free to use, study, modify, and distribute your project for any purpose. These permissions are enforced through an open source license.

Open source is powerful because it lowers the barriers to adoption and collaboration, allowing people to spread and improve projects quickly. Also because it gives users a potential to control their own computing, relative to closed source. For example, a business using open source software has the option to hire someone to make custom improvements to the software, rather than relying exclusively on a closed source vendor's product decisions.

*Free software* refers to the same set of projects as open source. Sometimes you'll also see these terms combined as "free and open source software" (FOSS) or "free, libre, and open source software" (FLOSS). *Free* and *libre* refer to freedom, not price.

#### Why do people open source their work?

> One of the most rewarding experiences I get out of using and collaborating on open source comes from the relationships that I build with other developers facing many of the same problems I am.
> -- @kentcdodds, "How getting into Open Source has been awesome for me"

There are many reasons why a person or organization would want to open source a project. Some examples include:

- **Collaboration:** Open source projects can accept changes from anybody in the world. Exercism, for example, is a programming exercise platform with over 350 contributors.
- **Adoption and remixing:** Open source projects can be used by anyone for nearly any purpose. People can even use it to build other things. WordPress, for example, started as a fork of an existing project called b2.
- **Transparency:** Anyone can inspect an open source project for errors or inconsistencies. Transparency matters to governments like Bulgaria or the United States, regulated industries like banking or healthcare, and security software like Let's Encrypt.

Open source isn't just for software, either. You can open source everything from data sets to books. Check out GitHub Explore for ideas on what else you can open source.

#### Does open source mean "free of charge"?

One of open source's biggest draws is that it does not cost money. "Free of charge", however, is a byproduct of open source's overall value.

Because an open source license requires that anyone can use, modify, and share your project for nearly any purpose, projects themselves tend to be free of charge. If the project cost money to use, anyone could legally make a copy and use the free version instead.

As a result, most open source projects are free, but "free of charge" is not part of the open source definition. There are ways to charge for open source projects indirectly through dual licensing or limited features, while still complying with the official definition of open source.

### 4.2 Should I Launch My Own Open Source Project?

The short answer is yes, because no matter the outcome, launching your own project is a great way to learn how open source works.

If you've never open sourced a project before, you might be nervous about what people will say, or whether anyone will notice at all. If this sounds like you, you're not alone!

Open source work is like any other creative activity, whether it's writing or painting. It can feel scary to share your work with the world, but the only way to get better is to practice - even if you don't have an audience.

#### Setting your goals

Goals can help you figure out what to work on, what to say no to, and where you need help from others. Start by asking yourself, *why am I open sourcing this project?*

There is no one right answer to this question. You may have multiple goals for a single project, or different projects with different goals.

If your only goal is to show off your work, you may not even want contributions, and even say so in your README. On the other hand, if you do want contributors, you'll invest time into clear documentation and making newcomers feel welcome.

> At some point I created a custom UIAlertView that I was using...and I decided to make it open source. So I modified it to be more dynamic and uploaded it to GitHub. I also wrote my first documentation explaining to other developers how to use it on their projects. Probably nobody ever used it because it was a simple project but I was feeling good about my contribution.
> -- @mavris, "Self-taught Software Developers: Why Open Source is important to us"

As your project grows, your community may need more than just code from you. Responding to issues, reviewing code, and evangelizing your project are all important tasks in an open source project.

If you're part of a company open sourcing a project, make sure your project has the internal resources it needs to thrive. You'll want to identify who's responsible for maintaining the project after launch, and how you'll share those tasks with your community.

> As you begin to open source the project, it's important to make sure that your management processes take into consideration the contributions and abilities of the community around your project. Don't be afraid to involve contributors who are not employed in your business in key aspects of the project -- especially if they are frequent contributors.
> -- @captainsafia, "So you wanna open source a project, eh?"

#### Contributing to other projects

If your goal is to learn how to collaborate with others or understand how open source works, consider contributing to an existing project. Start with a project that you already use and love. Contributing to a project can be as simple as fixing typos or updating documentation.

### 4.3 Launching Your Own Open Source Project

There is no perfect time to open source your work. You can open source an idea, a work in progress, or after years of being closed source.

Generally speaking, you should open source your project when you feel comfortable having others view, and give feedback on, your work.

No matter which stage you decide to open source your project, every project should include the following documentation:

- Open source license
- README
- Contributing guidelines
- Code of conduct

As a maintainer, these components will help you communicate expectations, manage contributions, and protect everyone's legal rights (including your own).

#### Choosing a license

An open source license guarantees that others can use, copy, modify, and contribute back to your project without repercussions. It also protects you from sticky legal situations. **You must include a license when you launch an open source project.**

Legal work is no fun. The good news is that you can copy and paste an existing license into your repository. It will only take a minute to protect your hard work.

MIT, Apache 2.0, and GPLv3 are the most popular open source licenses, but there are other options to choose from.

When you create a new project on GitHub, you are given the option to select a license. Including an open source license will make your GitHub project open source.

#### Writing a README

READMEs do more than explain how to use your project. They also explain why your project matters, and what your users can do with it.

In your README, try to answer the following questions:

- What does this project do?
- Why is this project useful?
- How do I get started?
- Where can I get more help, if I need it?

You can use your README to answer other questions, like how you handle contributions, what the goals of the project are, and information about licenses and attribution. If you don't want to accept contributions, or your project is not yet ready for production, write this information down.

> Better documentation means more users, less support requests, and more contributors. (...) Remember that your readers aren't you. There are people who might come to a project who have completely different experiences.
> -- @tracymakes, "Writing So Your Words Are Read (video)"

#### Writing your contributing guidelines

A CONTRIBUTING file tells your audience how to participate in your project. For example, you might include information on:

- How to file a bug report (try using issue and pull request templates)
- How to suggest a new feature
- How to set up your environment and run tests

In addition to technical details, a CONTRIBUTING file is an opportunity to communicate your expectations for contributions, such as:

- The types of contributions you're looking for
- Your roadmap or vision for the project
- How contributors should (or should not) get in touch with you

Using a warm, friendly tone and offering specific suggestions for contributions (such as writing documentation, or making a website) can go a long way in making newcomers feel welcomed and excited to participate.

For example, Active Admin starts its contributing guide with:

> First off, thank you for considering contributing to Active Admin. It's people like you that make Active Admin such a great tool.

#### Establishing a code of conduct

> We've all had experiences where we faced what was probably abuse either as a maintainer trying to explain why something had to be a certain way, or as a user...asking a simple question. (...) A code of conduct becomes an easily referenced and linkable document that indicates that your team takes constructive discourse very seriously.
> -- @mlynch, "Making Open Source a Happier Place"

Finally, a code of conduct helps set ground rules for behavior for your project's participants. This is especially valuable if you're launching an open source project for a community or company.

The Contributor Covenant is a drop-in code of conduct that is used by over 40,000 open source projects, including Kubernetes, Rails, and Swift. No matter which text you use, you should be prepared to enforce your code of conduct when necessary.

Paste the text directly into a `CODE_OF_CONDUCT` file in your repository. Keep the file in your project's root directory so it's easy to find, and link to it from your README.

### 4.4 Naming and Branding Your Project

Branding is more than a flashy logo or catchy project name. It's about how you talk about your project, and who you reach with your message.

#### Choosing the right name

Pick a name that is easy to remember and, ideally, gives some idea of what the project does. For example:

- **Sentry** monitors apps for crash reporting
- **Thin** is a fast and simple Ruby web server

If you're building upon an existing project, using their name as a prefix can help clarify what your project does (for example, **node-fetch** brings `window.fetch` to Node.js).

Consider clarity above all. Puns are fun, but remember that some jokes might not translate to other cultures or people with different experiences from you.

#### Avoiding name conflicts

Check for open source projects with a similar name, especially if you share the same language or ecosystem. If your name overlaps with a popular existing project, you might confuse your audience.

If you want a website, Twitter handle, or other properties to represent your project, make sure you can get the names you want.

Make sure that your project's name doesn't infringe upon any trademarks. You can check the WIPO Global Brand Database for trademark conflicts.

#### How you write (and code) affects your brand, too!

Throughout the life of your project, you'll do a lot of writing: READMEs, tutorials, community documents, responding to issues, maybe even newsletters and mailing lists.

Whether it's official documentation or a casual email, your writing style is part of your project's brand.

> I tried to be involved with every thread on the mailing list, and showing exemplary behaviour, being nice to people, taking their issues seriously and trying to be helpful overall. After a while, people stuck around not to only ask questions, but to help with the answering as well, and to my complete delight, they mimicked my style.
> -- @janl on CouchDB, "Sustainable Open Source"

Using warm, inclusive language (such as "them", even when referring to the single person) can go a long way in making your project feel welcoming to new contributors. Stick to simple language, as many of your readers may not be native English speakers.

Beyond how you write words, your coding style may also become part of your project's brand. Angular and jQuery are two examples of projects with rigorous coding styles and guidelines.

### 4.5 Your Pre-Launch Checklist

Ready to open source your project? Here's a checklist to help.

**Documentation:**
- [ ] Project has a LICENSE file with an open source license
- [ ] Project has basic documentation (README, CONTRIBUTING, CODE_OF_CONDUCT)
- [ ] The name is easy to remember, gives some idea of what the project does, and does not conflict with an existing project or infringe on trademarks
- [ ] The issue queue is up-to-date, with issues clearly organized and labeled

**Code:**
- [ ] Project uses consistent code conventions and clear function/method/variable names
- [ ] The code is clearly commented, documenting intentions and edge cases
- [ ] There are no sensitive materials in the revision history, issues, or pull requests (for example, passwords or other non-public information)

**People:**

*If you're an individual:*
- [ ] You've talked to the legal department and/or understand the IP and open source policies of your company (if you're an employee somewhere)

*If you're a company or organization:*
- [ ] You've talked to your legal department
- [ ] You have a marketing plan for announcing and promoting the project
- [ ] Someone is committed to managing community interactions (responding to issues, reviewing and merging pull requests)
- [ ] At least two people have administrative access to the project

Congratulations on open sourcing your first project. No matter the outcome, working in public is a gift to the community. With every commit, comment, and pull request, you're creating opportunities for yourself and for others to learn and grow.

---

## 5. Finding Users for Your Project

*Help your open source project grow by getting it in the hands of happy users.*

### 5.1 Spreading the Word

There's no rule that says you have to promote an open source project when you launch. There are many fulfilling reasons to work in open source that have nothing to do with popularity. Instead of hoping others will find and use your open source project, you have to spread the word about your hard work!

### 5.2 Figure Out Your Message

Before you start the actual work of promoting your project, you should be able to explain what it does, and why it matters.

What makes your project different or interesting? Why did you create it? Answering these questions for yourself will help you communicate your project's significance.

Remember that people get involved as users, and eventually become contributors, because your project solves a problem for them. As you think about your project's message and value, try to view them through the lens of what users and contributors might want.

For a deeper dive into messaging, check out Mozilla's "Personas and Pathways" exercise for developing user personas.

### 5.3 Help People Find and Follow Your Project

> You ideally need a single "home" URL that you can promote and point people to in relation to your project. You don't need to splash out on a fancy template or even a domain name, but your project needs a focal point.
> -- Peter Cooper & Robert Nyman, "How to Spread the Word About Your Code"

Help people find and remember your project by pointing them to a single namespace.

**Have a clear handle to promote your work.** A Twitter handle, GitHub URL, or IRC channel is an easy way to point people to your project. These outlets also give your project's growing community a place to convene.

If you don't wish to set up outlets for your project yet, promote your own Twitter or GitHub handle in everything you do.

> A mistake I made in those early days (...) was not starting a Twitter account for the project. Twitter's a great way to keep people up to date about a project as well as constantly expose people to the project.
> -- @nathanmarz, "History of Apache Storm and Lessons Learned"

**Consider creating a website for your project.** A website makes your project friendlier and easier to navigate, especially when it's paired with clear documentation and tutorials. Having a website also suggests that your project is active which will make your audience feel more comfortable using it.

@adrianholovaty, co-creator of Django, said that a website was *"by far the best thing we did with Django in the early days"*.

If your project is hosted on GitHub, you can use GitHub Pages to easily make a website. Yeoman, Vagrant, and Middleman are a few examples of excellent, comprehensive websites.

### 5.4 Go Where Your Project's Audience Is (Online)

Online outreach is a great way to share and spread the word quickly. Using online channels, you have the potential to reach a very wide audience.

Take advantage of existing online communities and platforms to reach your audience. If your open source project is a software project, you can probably find your audience on Stack Overflow, Reddit, Hacker News, or Quora. Find the channels where you think people will most benefit from or be excited about your work.

> Each program has very specific functions that only a fraction of users will find useful. Don't spam as many people as possible. Instead, target your efforts to communities that will benefit from knowing about your project.
> -- @pazdera, "Marketing for open source projects"

See if you can find ways to share your project in relevant ways:

- **Get to know relevant open source projects and communities.** Sometimes, you don't have to directly promote your project. If your project is perfect for data scientists who use Python, get to know the Python data science community. As people get to know you, natural opportunities will arise to talk about and share your work.
- **Find people experiencing the problem that your project solves.** Search through related forums for people who fall into your project's target audience. Answer their question and find a tactful way, when appropriate, to suggest your project as a solution.
- **Ask for feedback.** Introduce yourself and your work to an audience that would find it relevant and interesting. Be specific about who you think would benefit from your project. Try to finish the sentence: *"I think my project would really help X, who are trying to do Y"*. Listen and respond to others' feedback, rather than simply promoting your work.

Generally speaking, focus on helping others before asking for things in return. Because anyone can easily promote a project online, there will be a lot of noise. To stand out from the crowd, give people context for who you are and not just what you want.

If nobody pays attention or responds to your initial outreach, don't get discouraged! Most project launches are an iterative process that can take months or years.

### 5.5 Go Where Your Project's Audience Is (Offline)

Offline events are a popular way to promote new projects to audiences. They're a great way to reach an engaged audience and build deeper human connections, especially if you are interested in reaching developers.

If you're new to public speaking, start by finding a local meetup that's related to the language or ecosystem of your project.

> I was pretty nervous about going to PyCon. I was giving a talk, I was only going to know a couple of people there, I was going for an entire week. (...) I shouldn't have worried, though. PyCon was phenomenally awesome! (...) Everyone was incredibly friendly and outgoing, so much that I rarely found time not to talk to people!
> -- @jhamrick, "How I learned to Stop Worrying and Love PyCon"

If you've never spoken at an event before, it's perfectly normal to feel nervous! Remember that your audience is there because they genuinely want to hear about your work.

As you write your talk, focus on what your audience will find interesting and get value out of. Keep your language friendly and approachable. Smile, breathe, and have fun.

> When you start writing your talk, no matter what your topic is, it can help if you see your talk as a story that you tell people.
> -- Lena Reinhard, "How to Prepare and Write a Tech Conference Talk"

When you feel ready, consider speaking at a conference to promote your project. Conferences can help you reach more people, sometimes from all over the world.

> I wrote very nicely to the JSConf people and begged them to give me a slot where I could present it at JSConf EU. (...) I was extremely scared, presenting this thing that I had been working on for six months. (...) The whole time I was just thinking, oh my God. What am I doing here?
> -- @ry, "History of Node.js" (video)

### 5.6 Build a Reputation

In addition to the strategies outlined above, the best way to invite people to share and contribute to your project is to share and contribute to their projects.

Helping newcomers, sharing resources, and making thoughtful contributions to others' projects will help you build a positive reputation. Being an active member in the open source community will help people have context for your work and be more likely to pay attention to and share your project.

> The only reason urllib3 is the most popular third-party Python library today is because it's part of requests.
> -- @shazow, "How to make your open source project thrive"

It's never too early, or too late, to start building your reputation. Even if you've launched your own project already, continue to look for ways to help others.

There is no overnight solution to building an audience. Gaining the trust and respect of others takes time, and building your reputation never ends.

### 5.7 Keep at It!

It may take a long time before people notice your open source project. That's okay! Some of the most popular projects today took years to reach high levels of activity. Focus on building relationships instead of hoping that your project will spontaneously gain popularity. Be patient, and keep sharing your work with those who appreciate it.

---

## 6. Building Welcoming Communities

*Building a community that encourages people to use, contribute to, and evangelize your project.*

### 6.1 Setting Your Project Up for Success

You've launched your project, you're spreading the word, and people are checking it out. Awesome! Now, how do you get them to stick around?

A welcoming community is an investment into your project's future and reputation. If your project is just starting to see its first contributions, start by giving early contributors a positive experience, and make it easy for them to keep coming back.

#### Make people feel welcome

One way to think about your project's community is through what @MikeMcQuaid calls the *contributor funnel*:

As you build your community, consider how someone at the top of the funnel (a potential user) might theoretically make their way to the bottom (an active maintainer). Your goal is to reduce friction at each stage of the contributor experience. When people have easy wins, they will feel incentivized to do more.

Start with your documentation:

- **Make it easy for someone to use your project.** A friendly README and clear code examples will make it easier for anyone who lands on your project to get started.
- **Clearly explain how to contribute,** using your CONTRIBUTING file and keeping your issues up-to-date.
- **Good first issues:** To help new contributors get started, consider explicitly labeling issues that are simple enough for beginners to tackle.

GitHub's 2017 Open Source Survey showed incomplete or confusing documentation is the biggest problem for open source users. Good documentation invites people to interact with your project.

- When someone new lands on your project, **thank them for their interest!** It only takes one negative experience to make someone not want to come back.
- **Be responsive.** If you don't respond to their issue for a month, chances are, they've already forgotten about your project.
- **Be open-minded** about the types of contributions you'll accept. Many contributors start with a bug report or a small fix. There are many ways to contribute to a project. Let people help how they want to help.
- If there's a contribution you disagree with, **thank them for their idea** and explain why it doesn't fit into the scope of the project, linking to relevant documentation if you have it.

> Contributing to open source is easier for some than others. There's a lot of fear of being yelled at for not doing something right or just not fitting in. (...) By giving contributors a place to contribute with very low technical proficiency (documentation, web content markdown, etc) you can greatly reduce those concerns.
> -- @mikeal, "Growing a contributor base in modern open source"

The majority of open source contributors are "casual contributors": people who contribute to a project only occasionally. A casual contributor may not have time to get fully up to speed with your project, so your job is to make it easy for them to contribute.

#### Document everything

> Have you ever been to a (tech-) event where you didn't know anyone, but everyone else seemed to stand in groups and chat like old friends? (...) Now imagine you want to contribute to an open source project, but you don't see why or how this is happening.
> -- @janl, "Sustainable Open Source"

When you start a new project, it may feel natural to keep your work private. But open source projects thrive when you document your process in public.

When you write things down, more people can participate at every step of the way. You might get help on something you didn't even know you needed.

Writing things down means more than just technical documentation. Any time you feel the urge to write something down or privately discuss your project, ask yourself whether you can make it public.

Be transparent about your project's roadmap, the types of contributions you're looking for, how contributions are reviewed, or why you made certain decisions.

If you notice multiple users running into the same problem, document the answers in the README.

For meetings, consider publishing your notes or takeaways in a relevant issue. The feedback you'll get from this level of transparency may surprise you.

#### Be responsive

As you promote your project, people will have feedback for you. They may have questions about how things work, or need help getting started.

Try to be responsive when someone files an issue, submits a pull request, or asks a question about your project. When you respond quickly, people will feel they are part of a dialogue, and they'll be more enthusiastic about participating.

Even if you can't review the request immediately, acknowledging it early helps increase engagement.

A Mozilla study found that contributors who received code reviews within 48 hours had a much higher rate of return and repeat contribution.

#### Give your community a place to congregate

There are two reasons to give your community a place to congregate.

**The first reason is for them.** Help people get to know each other. People with common interests will inevitably want a place to talk about it. And when communication is public and accessible, anybody can read past archives to get up to speed and participate.

**The second reason is for you.** If you don't give people a public place to talk about your project, they will likely contact you directly. In the beginning, it may seem easy enough to respond to private messages "just this once". But over time, especially if your project becomes popular, you will feel exhausted. Resist the temptation to communicate with people about your project in private. Instead, direct them to a designated public channel.

Public communication can be as simple as directing people to open an issue instead of emailing you directly or commenting on your blog. You could also set up a mailing list, or create a Twitter account, Slack, or IRC channel for people to talk about your project.

Notable exceptions to public communication are: 1) security issues and 2) sensitive code of conduct violations. You should always have a way for people to report these issues privately.

### 6.2 Growing Your Community

Communities are extremely powerful. That power can be a blessing or a curse, depending on how you wield it. As your project's community grows, there are ways to help it become a force of construction, not destruction.

#### Don't tolerate bad actors

Any popular project will inevitably attract people who harm, rather than help, your community. They may start unnecessary debates, quibble over trivial features, or bully others.

Do your best to adopt a zero-tolerance policy towards these types of people. If left unchecked, negative people will make other people in your community uncomfortable. They may even leave.

> The truth is that having a supportive community is key. I'd never be able to do this work without the help of my colleagues, friendly internet strangers, and chatty IRC channels. (...) Don't settle for less. Don't settle for assholes.
> -- @okdistribute, "How to Run a FOSS Project"

When you see negative behavior happening on your project, call it out publicly. Explain, in a kind but firm tone, why their behavior is not acceptable. If the problem persists, you may need to ask them to leave. Your code of conduct can be a constructive guide for these conversations.

#### Meet contributors where they're at

Good documentation only becomes more important as your community grows. Casual contributors, who may not otherwise be familiar with your project, read your documentation to quickly get the context they need.

In your CONTRIBUTING file, explicitly tell new contributors how to get started. You may even want to make a dedicated section for this purpose. Django, for example, has a special landing page to welcome new contributors.

In your issue queue, label bugs that are suitable for different types of contributors: for example, "first timers only", "good first issue", or "documentation".

Finally, use your documentation to make people feel welcome at every step of the way.

For example, here's how Rubinius starts its contributing guide:

> We want to start off by saying thank you for using Rubinius. This project is a labor of love, and we appreciate all of the users that catch bugs, make performance improvements, and help with documentation. Every contribution is meaningful, so thank you for participating. That being said, here are a few guidelines that we ask you to follow so we can successfully address your issue.

#### Share ownership of your project

> Your leaders will have different opinions, as all healthy communities should! However, you need to take steps to ensure the loudest voice doesn't always win by tiring people out, and that less prominent and minority voices are heard.
> -- @sagesharp, "What makes a good community?"

People are excited to contribute to projects when they feel a sense of ownership. That doesn't mean you need to turn over your project's vision or accept contributions you don't want. But the more you give credit to others, the more they'll stick around.

See if you can find ways to share ownership with your community as much as possible. Here are some ideas:

- **Resist fixing easy (non-critical) bugs.** Instead, use them as opportunities to recruit new contributors, or mentor someone who'd like to contribute.
- **Start a CONTRIBUTORS or AUTHORS file** in your project that lists everyone who's contributed to your project.
- If you've got a sizable community, **send out a newsletter or write a blog post** thanking contributors.
- **Give every contributor commit access.** @felixge found that this made people more excited to polish their patches, and he even found new maintainers for projects that he hadn't worked on in awhile.
- If your project is on GitHub, **move your project from your personal account to an Organization** and add at least one backup admin.

> [It's in your] best interest to recruit contributors who enjoy and who are capable of doing the things that you are not. Do you enjoy coding, but not answering issues? Then identify those individuals in your community who do and let them have it.
> -- @gr2m, "Welcoming Communities"

### 6.3 Resolving Conflicts

In the early stages of your project, making major decisions is easy. When you want to do something, you just do it.

As your project becomes more popular, more people will take interest in the decisions you make.

#### Set the bar for kindness

When your community is grappling with a difficult issue, tempers may rise. People may become angry or frustrated and take it out on one another, or on you.

Your job as a maintainer is to keep these situations from escalating. Even if you have a strong opinion on the topic, try to take the position of a moderator or facilitator, rather than jumping into the fight and pushing your views.

> As a project maintainer, it's extremely important to be respectful to your contributors. They often take what you say very personally.
> -- @kennethreitz, "Be Cordial or Be on Your Way"

Other people are looking to you for guidance. Set a good example. You can still express disappointment, unhappiness, or concern, but do so calmly.

#### Treat your README as a constitution

Your README is more than just a set of instructions. It's also a place to talk about your goals, product vision, and roadmap. If people are overly focused on debating the merit of a particular feature, it may help to revisit your README and talk about the higher vision of your project. Focusing on your README also depersonalizes the conversation, so you can have a constructive discussion.

#### Focus on the journey, not the destination

Some projects use a voting process to make major decisions. While sensible at first glance, voting emphasizes getting to an "answer," rather than listening to and addressing each other's concerns.

Under a consensus seeking process, community members discuss major concerns until they feel they have been adequately heard. When only minor concerns remain, the community moves forward. "Consensus seeking" acknowledges that a community may not be able to reach a perfect answer. Instead, it prioritizes listening and discussion.

> Part of the reason why a voting system doesn't exist for Atom Issues is because the Atom team isn't going to follow a voting system in all cases. Sometimes we have to choose what we feel is right even if it is unpopular. (...) What I can offer and pledge to do...is that it is my job to listen to the community.
> -- @lee-dohm on Atom's decision making process

#### Keep the conversation focused on action

Discussion is important, but there is a difference between productive and unproductive conversations.

Encourage discussion so long as it is actively moving towards resolution. If it's clear that conversation is languishing or going off-topic, jabs are getting personal, or people are quibbling about minor details, it's time to shut it down.

> Guiding a thread toward usefulness without being pushy is an art. It won't work to simply admonish people to stop wasting their time, or to ask them not to post unless they have something constructive to say. (...) Instead, you have to suggest conditions for further progress: give people a route, a path to follow that leads to the results you want, yet without sounding like you're dictating conduct.
> -- @kfogel, *Producing OSS*

#### Pick your battles wisely

Context is important. Consider who is involved in the discussion and how they represent the rest of the community.

Is everybody in the community upset about, or even engaged with, this issue? Or is a lone troublemaker? Don't forget to consider your silent community members, not just the active voices.

#### Identify a community tiebreaker

With a good attitude and clear communication, most difficult situations are resolvable. However, even in a productive conversation, there can simply be a difference in opinion on how to proceed. In these cases, identify an individual or group of people that can serve as a tiebreaker.

A tiebreaker could be the primary maintainer of the project, or it could be a small group of people who make a decision based on voting. Ideally, you've identified a tiebreaker and the associated process in a GOVERNANCE file before you ever have to use it.

Your tiebreaker should be a last resort. Divisive issues are an opportunity for your community to grow and learn. Embrace these opportunities and use a collaborative process to move to a resolution wherever possible.

### 6.4 Community Is the Heart of Open Source

Healthy, thriving communities fuel the thousands of hours poured into open source every week. Many contributors point to other people as the reason for working - or not working - on open source. By learning how to tap into that power constructively, you'll help someone out there have an unforgettable open source experience.

---

## 7. Best Practices for Maintainers

*Making your life easier as an open source maintainer, from documenting processes to leveraging your community.*

### 7.1 What Does It Mean to Be a Maintainer?

If you maintain an open source project that a lot of people use, you may have noticed you're coding less and responding to issues more.

In the early stages of a project, you're experimenting with new ideas and making decisions based on what you want. As your project increases in popularity, you'll find yourself working with your users and contributors more.

Maintaining a project requires more than code. These tasks are often unexpected, but they're just as important to a growing project. We've gathered a few ways to make your life easier, from documenting processes to leveraging your community.

### 7.2 Documenting Your Processes

Writing things down is one of the most important things you can do as a maintainer.

Documentation not only clarifies your own thinking, but it helps other people understand what you need or expect, before they even ask.

Writing things down makes it easier to say no when something doesn't fit into your scope. It also makes it easier for people to pitch in and help. You never know who might be reading or using your project.

Even if you don't use full paragraphs, jotting down bullet points is better than not writing at all.

Remember to keep your documentation up-to-date. If you're not able to always do this, delete your outdated documentation or indicate it is outdated so contributors know updates are welcome.

#### Write down your project's vision

Start by writing down the goals of your project. Add them to your README, or create a separate file called VISION. If there are other artifacts that could help, like a project roadmap, make those public as well.

Having a clear, documented vision keeps you focused and helps you avoid "scope creep" from others' contributions.

> I fumbled it. I didn't put in the effort to come up with a complete solution. Instead of a half-assed solution, I wish I had said "I don't have time for this right now, but I'll add it to the long term nice-to-have list."
> -- @lord, "Tips for new open source maintainers"

#### Communicate your expectations

Rules can be nerve-wracking to write down. Sometimes you might feel like you're policing other people's behavior or killing all the fun.

Written and enforced fairly, however, good rules empower maintainers. They prevent you from getting dragged into doing things you don't want to do.

Here are a few rules that are worth writing down:

- How a contribution is reviewed and accepted (Do they need tests? An issue template?)
- The types of contributions you'll accept (Do you only want help with a certain part of your code?)
- When it's appropriate to follow up (for example, "You can expect a response from a maintainer within 7 days. If you haven't heard anything by then, feel free to ping the thread.")
- How much time you spend on the project (for example, "We only spend about 5 hours per week on this project")

Jekyll, CocoaPods, and Homebrew are several examples of projects with ground rules for maintainers and contributors.

#### Keep communication public

Don't forget to document your interactions, too. Wherever you can, keep communication about your project public. If somebody tries to contact you privately to discuss a feature request or support need, politely direct them to a public communication channel, such as a mailing list or issue tracker.

If you meet with other maintainers, or make a major decision in private, document these conversations in public, even if it's just posting your notes.

That way, anybody who joins your community will have access to the same information as someone who's been there for years.

### 7.3 Learning to Say No

You've written things down. Ideally, everybody would read your documentation, but in reality, you'll have to remind others that this knowledge exists.

Having everything written down, however, helps depersonalize situations when you do need to enforce your rules.

Saying no isn't fun, but *"Your contribution doesn't match this project's criteria"* feels less personal than *"I don't like your contribution"*.

#### Keep the conversation friendly

One of the most important places you'll practice saying no is on your issue and pull request queue. As a project maintainer, you'll inevitably receive suggestions that you don't want to accept.

> The key to handling support for large-scale open source projects is to keep issues moving. Try to avoid having issues stall. If you're an iOS developer you know how frustrating it can be to submit radars. You might hear back 2 years later, and are told to try again with the latest version of iOS.
> -- @KrauseFx, "Scaling open source communities"

Don't leave an unwanted contribution open because you feel guilty or want to be nice. Over time, your unanswered issues and PRs will make working on your project feel that much more stressful and intimidating.

It's better to immediately close the contributions you know you don't want to accept.

If you don't want to accept a contribution:

- **Thank them** for their contribution
- **Explain why it doesn't fit** into the scope of the project, and offer clear suggestions for improvement, if you're able. Be kind, but firm.
- **Link to relevant documentation,** if you have it. If you notice repeated requests for things you don't want to accept, add them into your documentation to avoid repeating yourself.
- **Close the request**

You shouldn't need more than 1-2 sentences to respond.

Don't feel guilty about not wanting to accept someone's contribution. The first rule of open source, according to @shykes: *"No is temporary, yes is forever."* While empathizing with another person's enthusiasm is a good thing, rejecting a contribution is not the same as rejecting the person behind it.

#### Be proactive

To reduce the volume of unwanted contributions in the first place, explain your project's process for submitting and accepting contributions in your contributing guide.

If you're receiving too many low-quality contributions, require that contributors do a bit of work beforehand, for example:

- Fill out an issue or PR template/checklist
- Open an issue before submitting a PR

> Ideally, explain to them and in a CONTRIBUTING.md file how they can get a better indication in the future on what would or would not be accepted before they begin the work.
> -- @MikeMcQuaid, "Kindly Closing Pull Requests"

Sometimes, when you say no, your potential contributor may get upset or criticize your decision. If their behavior becomes hostile, take steps to defuse the situation or even remove them from your community, if they're not willing to collaborate constructively.

#### Embrace mentorship

Maybe someone in your community regularly submits contributions that don't meet your project's standards. It can be frustrating for both parties to repeatedly go through rejections.

If you see that someone is enthusiastic about your project, but needs a bit of polish, be patient. Explain clearly in each situation why their contributions don't meet the expectations of the project. Try pointing them to an easier or less ambiguous task, like an issue marked "good first issue," to get their feet wet.

### 7.4 Leverage Your Community

You don't have to do everything yourself. Your project's community exists for a reason! Even if you don't yet have an active contributor community, if you have a lot of users, put them to work.

#### Share the workload

If you're looking for others to pitch in, start by asking around.

One way to gain new contributors is to explicitly label issues that are simple enough for beginners to tackle. GitHub will then surface these issues in various places on the platform, increasing their visibility.

When you see new contributors making repeated contributions, recognize their work by offering more responsibility. Document how others can grow into leadership roles if they wish.

> I'd been saying, "Yeah, anyone can be involved, you don't have to have a lot of coding expertise [...]." We had people sign up to come [to an event] and that's when I was really wondering: is this true, what I've been saying? There are gonna be 40 people who show up, and it's not like I can sit with each of them...But people came together, and it just sort of worked. As soon as one person got it, they could teach their neighbour.
> -- @lmccart, "What Does 'Open Source' Even Mean? p5.js Edition"

If you need to step away from your project, either on hiatus or permanently, there's no shame in asking someone else to take over for you.

If other people are enthusiastic about its direction, give them commit access or formally hand over control to someone else. If someone forked your project and is actively maintaining it elsewhere, consider linking to the fork from your original project.

#### Let others build the solutions they need

If a potential contributor has a different opinion on what your project should do, you may want to gently encourage them to work on their own fork.

Forking a project doesn't have to be a bad thing. Being able to copy and modify projects is one of the best things about open source.

> I cater to the 80% use case. If you are one of the unicorns, please fork my work. I won't get offended! My public projects are almost always meant to solve the most common problems; I try to make it easy to go deeper by either forking my work or extending it.
> -- @geerlingguy, "Why I Close PRs"

The same applies to a user who really wants a solution that you simply don't have the bandwidth to build. Offering APIs and customization hooks can help others meet their own needs, without having to modify the source directly.

> It's almost inevitable that once a project becomes big, maintainers have to become a lot more conservative about how they introduce new code. You become good at saying "no", but a lot of people have legitimate needs. So, instead you end up converting your tool into a platform.
> -- @orta

### 7.5 Bring in the Robots

Just as there are tasks that other people can help you with, there are also tasks that no human should ever have to do. Robots are your friend. Use them to make your life as a maintainer easier.

#### Require tests and other checks to improve the quality of your code

One of the most important ways you can automate your project is by adding tests.

Tests help contributors feel confident that they won't break anything. They also make it easier for you to review and accept contributions quickly. The more responsive you are, the more engaged your community can be.

Set up automatic tests that will run on all incoming contributions, and ensure that your tests can easily be run locally by contributors. Require that all code contributions pass your tests before they can be submitted.

> I believe that tests are necessary for all code that people work on. If the code was fully and perfectly correct, it wouldn't need changes -- we only write code when something is wrong, whether that's "It crashes" or "It lacks such-and-such a feature". And regardless of the changes you're making, tests are essential for catching any regressions you might accidentally introduce.
> -- @edunham, "Rust's Community Automation"

#### Use tools to automate basic maintenance tasks

There are a variety of tools available to help automate some aspects of maintenance work. A few examples:

- **semantic-release** automates your releases
- **mention-bot** mentions potential reviewers for pull requests
- **Danger** helps automate code review
- **no-response** closes issues where the author hasn't responded to a request for more information
- **dependabot** checks your dependency files every day for outdated requirements and opens individual pull requests for any it finds

For bug reports and other common contributions, GitHub has Issue Templates and Pull Request Templates, which you can create to streamline the communication you receive.

To manage your email notifications, you can set up email filters to organize by priority.

If you want to get a little more advanced, style guides and linters can standardize project contributions and make them easier to review and accept.

However, if your standards are too complicated, they can increase the barriers to contribution. Make sure you're only adding enough rules to make everyone's lives easier.

### 7.6 It's Okay to Hit Pause

Open source work once brought you joy. Maybe now it's starting to make you feel avoidant or guilty.

Perhaps you're feeling overwhelmed or a growing sense of dread when you think about your projects. And meanwhile, the issues and pull requests pile up.

Burnout is a real and pervasive issue in open source work, especially among maintainers. As a maintainer, your happiness is a non-negotiable requirement for the survival of any open source project.

Although it should go without saying, take a break! You shouldn't have to wait until you feel burned out to take a vacation.

> In maintaining WP-CLI, I've discovered I need to make myself happy first, and set clear boundaries on my involvement. The best balance I've found is 2-5 hours per week, as a part of my normal work schedule. This keeps my involvement a passion, and from feeling too much like work. Because I prioritize the issues I'm working on, I can make regular progress on what I think is most important.
> -- @danielbachhuber, "My condolences, you're now the maintainer of a popular open source project"

Sometimes, it can be hard to take a break from open source work when it feels like everybody needs you. People may even try to make you feel guilty for stepping away.

Do your best to find support for your users and community while you're away from a project. If you can't find the support you need, take a break anyway. Be sure to communicate when you're not available, so people aren't confused by your lack of responsiveness.

Taking breaks applies to more than just vacations, too. If you don't want to do open source work on weekends, or during work hours, communicate those expectations to others, so they know not to bother you.

### 7.7 Take Care of Yourself First!

Maintaining a popular project requires different skills than the earlier stages of growth, but it's no less rewarding. As a maintainer, you'll practice leadership and personal skills on a level that few people get to experience. While it's not always easy to manage, setting clear boundaries and only taking on what you're comfortable with will help you stay happy, refreshed, and productive.

---

## 8. Leadership and Governance

*Growing open source projects can benefit from formal rules for making decisions.*

### 8.1 Understanding Governance for Your Growing Project

Your project is growing, people are engaged, and you're committed to keeping this thing going. At this stage, you may be wondering how to incorporate regular project contributors into your workflow, whether it's giving someone commit access or resolving community debates. If you have questions, we've got answers.

### 8.2 What Are Examples of Formal Roles Used in Open Source Projects?

Many projects follow a similar structure for contributor roles and recognition.

What these roles actually mean, though, is entirely up to you. Here are a few types of roles you may recognize:

- **Maintainer**
- **Contributor**
- **Committer**

For some projects, "maintainers" are the only people in a project with commit access. In other projects, they're simply the people who are listed in the README as maintainers.

A maintainer doesn't necessarily have to be someone who writes code for your project. It could be someone who's done a lot of work evangelizing your project, or written documentation that made the project more accessible to others.

A "contributor" could be anyone who comments on an issue or pull request, people who add value to the project (whether it's triaging issues, writing code, or organizing events), or anybody with a merged pull request (perhaps the narrowest definition of a contributor).

> [For Node.js,] every person who shows up to comment on an issue or submit code is a member of a project's community. Just being able to see them means that they have crossed the line from being a user to being a contributor.
> -- @mikeal, "Healthy Open Source"

The term "committer" might be used to distinguish commit access, which is a specific type of responsibility, from other forms of contribution.

While you can define your project roles any way you'd like, consider using broader definitions to encourage more forms of contribution. You can use leadership roles to formally recognize people who have made outstanding contributions to your project, regardless of their technical skill.

> You might know me as the "inventor" of Django...but really I'm the guy who got hired to work on a thing a year after it was already made. (...) People suspect that I'm successful because of my programming skill...but I'm at best an average programmer.
> -- @jacobian, "PyCon 2015 Keynote" (video)

### 8.3 How Do I Formalize These Leadership Roles?

Formalizing your leadership roles helps people feel ownership and tells other community members who to look to for help.

For a smaller project, designating leaders can be as simple as adding their names to your README or a CONTRIBUTORS text file.

For a bigger project, if you have a website, create a team page or list your project leaders there. For example, Postgres has a comprehensive team page with short profiles for each contributor.

If your project has a very active contributor community, you might form a "core team" of maintainers, or even subcommittees of people who take ownership of different issue areas (for example, security, issue triaging, or community conduct). Let people self-organize and volunteer for the roles they're most excited about, rather than assigning them.

> [We] supplement the core team with several "subteams". Each subteam is focused on a specific area, e.g., language design or libraries. (...) To ensure global coordination and a strong, coherent vision for the project as a whole, each subteam is led by a member of the core team.
> -- "Rust Governance RFC"

Leadership teams may want to create a designated channel (like on IRC) or meet regularly to discuss the project. You can even make those meetings public so other people can listen. Cucumber-ruby, for example, hosts office hours every week.

Once you've established leadership roles, don't forget to document how people can attain them! Establish a clear process for how someone can become a maintainer or join a subcommittee in your project, and write it into your `GOVERNANCE.md`.

Tools like Vossibility can help you publicly track who is (or isn't) making contributions to the project. Documenting this information avoids the community perception that maintainers are a clique that makes its decisions privately.

Finally, if your project is on GitHub, consider moving your project from your personal account to an Organization and adding at least one backup admin.

### 8.4 When Should I Give Someone Commit Access?

Some people think you should give commit access to everybody who makes a contribution. Doing so could encourage more people to feel ownership of your project.

On the other hand, especially for bigger, more complex projects, you may want to only give commit access to people who have demonstrated their commitment. There's no one right way of doing it - do what makes you most comfortable!

If your project is on GitHub, you can use protected branches to manage who can push to a particular branch, and under which circumstances.

> Whenever somebody sends you a pull request, give them commit access to your project. While it may sound incredibly stupid at first, using this strategy will allow you to unleash the true power of GitHub. (...) Once people have commit access, they are no longer worried that their patch might go unmerged...causing them to put much more work into it.
> -- @felixge, "The Pull Request Hack"

### 8.5 What Are Some of the Common Governance Structures for Open Source Projects?

There are three common governance structures associated with open source projects.

**BDFL:** BDFL stands for "Benevolent Dictator for Life". Under this structure, one person (usually the initial author of the project) has final say on all major project decisions. Python is a classic example. Smaller projects are probably BDFL by default, because there are only one or two maintainers. A project that originated at a company might also fall into the BDFL category.

**Meritocracy:** *(Note: the term "meritocracy" carries negative connotations for some communities and has a complex social and political history.)* Under a meritocracy, active project contributors (those who demonstrate "merit") are given a formal decision making role. Decisions are usually made based on pure voting consensus. The meritocracy concept was pioneered by the Apache Foundation; all Apache projects are meritocracies. Contributions can only be made by individuals representing themselves, not by a company.

**Liberal contribution:** Under a liberal contribution model, the people who do the most work are recognized as most influential, but this is based on current work and not historic contributions. Major project decisions are made based on a consensus seeking process (discuss major grievances) rather than pure vote, and strive to include as many community perspectives as possible. Popular examples of projects that use a liberal contribution model include Node.js and Rust.

Which one should you use? It's up to you! Every model has advantages and trade-offs. If you're interested in adopting one of these models, check out these templates:

- BDFL model template
- Meritocracy model template
- Node.js's liberal contribution policy

### 8.6 Do I Need Governance Docs When I Launch My Project?

There is no right time to write down your project's governance, but it's much easier to define once you've seen your community dynamics play out. The best (and hardest) part about open source governance is that it is shaped by the community!

Some early documentation will inevitably contribute to your project's governance, however, so start writing down what you can. For example, you can define clear expectations for behavior, or how your contributor process works, even at your project's launch.

If you're part of a company launching an open source project, it's worth having an internal discussion before launch about how your company expects to maintain and make decisions about the project moving forward. You may also want to publicly explain anything particular to how your company will (or won't!) be involved with the project.

> We assign small teams to manage projects on GitHub who are actually working on these at Facebook. For example, React is run by a React engineer.
> -- @caabernathy, "An inside look at open source at Facebook"

### 8.7 What Happens If Corporate Employees Start Submitting Contributions?

Successful open source projects get used by many people and companies, and some companies may eventually have revenue streams tied to the project.

As the project gets more widely used, people who have expertise in it become more in-demand - you may be one of them! - and will sometimes get paid for work they do in the project.

It's important to treat commercial activity as normal and as just another source of development energy. Paid developers shouldn't get special treatment over unpaid ones, of course; each contribution must be evaluated on its technical merits. However, people should feel comfortable engaging in commercial activity, and feel comfortable stating their use cases when arguing in favor of a particular enhancement or feature.

"Commercial" is completely compatible with "open source". "Commercial" just means there is money involved somewhere - that the software is used in commerce, which is increasingly likely as a project gains adoption.

Like anyone else, commercially-motivated developers gain influence in the project through the quality and quantity of their contributions.

### 8.8 Do I Need a Legal Entity to Support My Project?

You don't need a legal entity to support your open source project unless you're handling money.

For example, if you want to create a commercial business, you'll want to set up a C Corp or LLC (if you're based in the US). If you're just doing contract work related to your open source project, you can accept money as a sole proprietor, or set up an LLC.

If you want to accept donations for your open source project, you can set up a donation button (using PayPal or Stripe, for example), but the money won't be tax-deductible unless you are a qualifying nonprofit (a 501c3, if you're in the US).

Many projects don't wish to go through the trouble of setting up a nonprofit, so they find a nonprofit fiscal sponsor instead. A fiscal sponsor accepts donations on your behalf, usually in exchange for a percentage of the donation. Software Freedom Conservancy, Apache Foundation, Eclipse Foundation, Linux Foundation and Open Collective are examples of organizations that serve as fiscal sponsors for open source projects.

> Our goal is to provide an infrastructure that communities can use to be self sustainable, thus creating an environment where everyone -- contributors, backers, sponsors -- get concrete benefits out of it.
> -- @piamancini, "Moving beyond the charity framework"

If your project is closely associated with a certain language or ecosystem, there may also be a related software foundation you can work with. For example, the Python Software Foundation helps support PyPI, the Python package manager, and the Node.js Foundation helps support Express.js, a Node-based framework.

---

## 9. Getting Paid for Open Source Work

*Sustain your work in open source by getting financial support for your time or your project.*

### 9.1 Why Some People Seek Financial Support

Much of the work of open source is voluntary. For example, someone might come across a bug in a project they use and submit a quick fix, or they might enjoy tinkering with an open source project in their spare time.

> I was looking for a "hobby" programming project that would keep me occupied during the week around Christmas. (...) I had a home computer, and not much else on my hands. I decided to write an interpreter for the new scripting language I had been thinking about lately. (...) I chose Python as a working title.
> -- @gvanrossum, "Programming Python"

There are many reasons why a person would not want to be paid for their open source work.

- They may already have a full-time job that they love, which enables them to contribute to open source in their spare time.
- They enjoy thinking of open source as a hobby or creative escape and don't want to feel financially obligated to work on their projects.
- They get other benefits from contributing to open source, such as building their reputation or portfolio, learning a new skill, or feeling closer to a community.

> Financial donations do add a feeling of responsibility, for some. (...) It's important for us, in the globally connected, fast-paced world we live in, to be able to say "not now, I feel like doing something completely different".
> -- @alloy, "Why We Don't Accept Donations"

For others, especially when contributions are ongoing or require significant time, getting paid to contribute to open source is the only way they can participate, either because the project requires it, or for personal reasons.

Maintaining popular projects can be a significant responsibility, taking up 10 or 20 hours per week instead of a few hours per month.

> Ask any open source project maintainer, and they will tell you about the reality of the amount of work that goes into managing a project. You have clients. You are fixing issues for them. You are creating new features. This becomes a real demand on your time.
> -- @ashedryden, "The Ethics of Unpaid Labor and the OSS Community"

Paid work also enables people from different walks of life to make meaningful contributions. Some people cannot afford to spend unpaid time on open source projects, based on their current financial position, debt, or family or other caretaking obligations. That means the world never sees contributions from talented people who can't afford to volunteer their time. This has ethical implications, as @ashedryden has described, since work that is done is biased in favor of those who already have advantages in life.

> OSS yields massive benefits to the technology industry, which, in turn, means benefits to all industries. (...) However, if the only people who can focus on it are the lucky and the obsessed, then there's a huge untapped potential.
> -- @isaacs, "Money and Open Source"

If you're looking for financial support, there are two paths to consider. You can fund your own time as a contributor, or you can find organizational funding for the project.

### 9.2 Funding Your Own Time

Today, many people get paid to work part- or full-time on open source. The most common way to get paid for your time is to talk to your employer.

It's easier to make a case for open source work if your employer actually uses the project, but get creative with your pitch. Maybe your employer doesn't use the project, but they use Python, and maintaining a popular Python project helps attract new Python developers. Maybe it makes your employer look more developer-friendly in general.

If you don't have an existing open source project you'd like to work on, but would rather that your current work output is open sourced, make a case for your employer to open source some of their internal software.

Many companies are developing open source programs to build their brand and recruit quality talent.

@hueniverse, for example, found that there were financial reasons to justify Walmart's investment in open source. And @jamesgpearce found that Facebook's open source program made a difference in recruiting:

> It is closely aligned with our hacker culture, and how our organization was perceived. We asked our employees, "Were you aware of the open source software program at Facebook?". Two-thirds said "Yes". One-half said that the program positively contributed to their decision to work for us. These are not marginal numbers, and I hope, a trend that continues.

If your company goes down this route, it's important to keep the boundaries between community and corporate activity clear. Ultimately, open source sustains itself through contributions from people all over the world, and that's bigger than any one company or location.

> Getting paid to work on open source is a rare and wonderful opportunity, but you should not have to give up your passion in the process. Your passion should be why companies want to pay you.
> -- @jessfraz, "Blurred Lines"

If you can't convince your current employer to prioritize open source work, consider finding a new employer that encourages employee contributions to open source. Look for companies that make their dedication to open source work explicit.

Depending on your personal circumstances, you can try raising money independently to fund your open source work. For example:

- @Homebrew (and many other maintainers and organizations) fund their work through **GitHub Sponsors**
- @gaearon funded his work on Redux through a **Patreon** crowdfunding campaign
- @andrewgodwin funded work on Django schema migrations through a **Kickstarter** campaign

Finally, sometimes open source projects put bounties on issues that you might consider helping with.

### 9.3 Finding Funding for Your Project

Beyond arrangements for individual contributors, sometimes projects raise money from companies, individuals, or others to fund ongoing work.

Organizational funding might go towards paying current contributors, covering the costs of running the project (such as hosting fees), or investing in new features or ideas.

As open source's popularity increases, finding funding for projects is still experimental, but there are a few common options available.

#### Raise money through crowdfunding campaigns or sponsorships

Finding sponsorships works well if you have a strong audience or reputation already, or your project is very popular. A few examples of sponsored projects include:

- **webpack** raises money from companies and individuals through OpenCollective
- **Ruby Together**, a nonprofit organization that pays for work on bundler, RubyGems, and other Ruby infrastructure projects

#### Create a revenue stream

Depending on your project, you may be able to charge for commercial support, hosted options, or additional features. A few examples include:

- **Sidekiq** offers paid versions for additional support
- **Travis CI** offers paid versions of its product
- **Ghost** is a nonprofit with a paid managed service

Some popular projects, like **npm** and **Docker**, even raise venture capital to support their business growth.

#### Apply for grant funding

Some software foundations and companies offer grants for open source work. Sometimes, grants can be paid out to individuals without setting up a legal entity for the project.

- Read the Docs received a grant from Mozilla Open Source Support
- OpenMRS work was funded by Stripe's Open-Source Retreat
- Libraries.io received a grant from the Sloan Foundation
- The Python Software Foundation offers grants for Python-related work
- FLOSS/fund is a dedicated fund to provide no-strings attached financial support to FOSS projects globally.
- The GitHub Secure Open Source Fund is a program designed to financially and programmatically improve security and sustainability of open source projects.

For more detailed options and case studies, @nayafia wrote a guide to getting paid for open source work.

### 9.4 Building a Case for Financial Support

Whether your project is a new idea, or has been around for years, you should expect to put significant thought into identifying your target funder and making a compelling case.

Whether you're looking to pay for your own time, or fundraise for a project, you should be able to answer the following questions:

**Impact:** Why is this project useful? Why do your users, or potential users, like it so much? Where will it be in five years?

**Traction:** Try to collect evidence that your project matters, whether it's metrics, anecdotes, or testimonials. Are there any companies or noteworthy people using your project right now? If not, has a prominent person endorsed it?

**Value to funder:** Funders, whether your employer or a grantmaking foundation, are frequently approached with opportunities. Why should they support your project over any other opportunity? How do they personally benefit?

**Use of funds:** What, exactly, will you accomplish with the proposed funding? Focus on project milestones or outcomes rather than paying a salary.

**How you'll receive the funds:** Does the funder have any requirements around disbursal? For example, you may need to be a nonprofit or have a nonprofit fiscal sponsor. Or perhaps the funds must be given to an individual contractor rather than an organization.

### 9.5 Experiment and Don't Give Up

Raising money isn't easy, whether you're an open source project, a nonprofit, or a software startup, and in most cases requires you to get creative. Identifying how you want to get paid, doing your research, and putting yourself in your funder's shoes will help you build a convincing case for funding.

---

## 10. Your Code of Conduct

*Facilitate healthy and constructive community behavior by adopting and enforcing a code of conduct.*

### 10.1 Why Do I Need a Code of Conduct?

A code of conduct is a document that establishes expectations for behavior for your project's participants. Adopting, and enforcing, a code of conduct can help create a positive social atmosphere for your community.

Codes of conduct help protect not just your participants, but yourself. If you maintain a project, you may find that unproductive attitudes from other participants can make you feel drained or unhappy about your work over time.

A code of conduct empowers you to facilitate healthy, constructive community behavior. Being proactive reduces the likelihood that you, or others, will become fatigued with your project, and helps you take action when someone does something you don't agree with.

### 10.2 Establishing a Code of Conduct

Try to establish a code of conduct as early as possible: ideally, when you first create your project.

In addition to communicating your expectations, a code of conduct describes the following:

- Where the code of conduct takes effect (only on issues and pull requests, or community activities like events?)
- Whom the code of conduct applies to (community members and maintainers, but what about sponsors?)
- What happens if someone violates the code of conduct
- How someone can report violations

Wherever you can, use prior art. The **Contributor Covenant** is a drop-in code of conduct that is used by over 40,000 open source projects, including Kubernetes, Rails, and Swift.

The **Django Code of Conduct** and the **Citizen Code of Conduct** are also two good code of conduct examples.

Place a `CODE_OF_CONDUCT` file in your project's root directory, and make it visible to your community by linking it from your CONTRIBUTING or README file.

### 10.3 Deciding How You'll Enforce Your Code of Conduct

> A code of conduct that isn't (or can't be) enforced is worse than no code of conduct at all: it sends the message that the values in the code of conduct aren't actually important or respected in your community.
> -- Ada Initiative

You should explain how your code of conduct will be enforced **before** a violation occurs. There are several reasons to do so:

- It demonstrates that you are serious about taking action when it's needed.
- Your community will feel more reassured that complaints actually get reviewed.
- You'll reassure your community that the review process is fair and transparent, should they ever find themselves investigated for a violation.

You should give people a private way (such as an email address) to report a code of conduct violation and explain who receives that report. It could be a maintainer, a group of maintainers, or a code of conduct working group.

Don't forget that someone might want to report a violation about a person who receives those reports. In this case, give them an option to report violations to someone else. For example, @ctb and @mr-c explain on their project, khmer:

> *Instances of abusive, harassing, or otherwise unacceptable behavior may be reported by emailing khmer-project@idyll.org which only goes to C. Titus Brown and Michael R. Crusoe. To report an issue involving either of them please email Judi Brown Clarke, Ph.D. the Diversity Director at the BEACON Center for the Study of Evolution in Action, an NSF Center for Science and Technology.*

For inspiration, check out Django's enforcement manual (though you may not need something this comprehensive, depending on the size of your project).

### 10.4 Enforcing Your Code of Conduct

Sometimes, despite your best efforts, somebody will do something that violates this code. There are several ways to address negative or harmful behavior when it comes up.

#### Gather information about the situation

Treat each community member's voice as important as your own. If you receive a report that someone violated the code of conduct, take it seriously and investigate the matter, even if it does not match your own experience with that person. Doing so signals to your community that you value their perspective and trust their judgment.

Before you respond, give yourself time to understand what happened. Read through the person's past comments and conversations to better understand who they are and why they might have acted in such a way. Try to gather perspectives other than your own about this person and their behavior.

> Don't get pulled into an argument. Don't get sidetracked into dealing with someone else's behavior before you've finished dealing with the matter at hand. Focus on what you need.
> -- Stephanie Zvan, "So You've Got Yourself a Policy. Now What?"

#### Take appropriate action

After gathering and processing sufficient information, you'll need to decide what to do. As you consider your next steps, remember that your goal as a moderator is to foster a safe, respectful, and collaborative environment.

When somebody reports a code of conduct violation, it is your, not their, job to handle it. Sometimes, the reporter is disclosing information at great risk to their career, reputation, or physical safety. Forcing them to confront their harasser could put the reporter in a compromising position.

There are a few ways you might respond to a code of conduct violation:

- **Give the person in question a public warning** and explain how their behavior negatively impacted others, preferably in the channel where it occurred. Where possible, public communication conveys to the rest of the community that you take the code of conduct seriously. Be kind, but firm in your communication.
- **Privately reach out to the person in question** to explain how their behavior negatively impacted others. You may want to use a private communication channel if the situation involves sensitive personal information.

Sometimes, a resolution cannot be reached. The person in question may become aggressive or hostile when confronted or does not change their behavior. In this situation, you may want to consider taking stronger action. For example:

- **Suspend the person in question** from the project, enforced through a temporary ban on participating in any aspect of the project
- **Permanently ban** the person from the project

Banning members should not be taken lightly and represents a permanent and irreconcilable difference of perspectives. You should only take these measures when it is clear that a resolution cannot be reached.

### 10.5 Your Responsibilities as a Maintainer

A code of conduct is not a law that is enforced arbitrarily. You are the enforcer of the code of conduct and it's your responsibility to follow the rules that the code of conduct establishes.

As a maintainer you establish the guidelines for your community and enforce those guidelines according to the rules set forth in your code of conduct. This means taking any report of a code of conduct violation seriously. The reporter is owed a thorough and fair review of their complaint. If you determine that the behavior that they reported is not a violation, communicate that clearly to them and explain why you're not going to take action on it. What they do with that is up to them: tolerate the behavior that they had an issue with, or stop participating in the community.

A report of behavior that doesn't technically violate the code of conduct may still indicate that there is a problem in your community, and you should investigate this potential problem and act accordingly. This may include revising your code of conduct to clarify acceptable behavior and/or talking to the person whose behavior was reported.

In the end, as a maintainer, you set and enforce the standards for acceptable behavior. You have the ability to shape the community values of the project, and participants expect you to enforce those values in a fair and even-handed way.

### 10.6 Encourage the Behavior You Want to See in the World

When a project seems hostile or unwelcoming, even if it's just one person whose behavior is tolerated by others, you risk losing many more contributors, some of whom you may never even meet. It's not always easy to adopt or enforce a code of conduct, but fostering a welcoming environment will help your community grow.

---

## 11. Open Source Metrics

*Make informed decisions to help your open source project thrive by measuring and tracking its success.*

### 11.1 Why Measure Anything?

Data, when used wisely, can help you make better decisions as an open source maintainer.

With more information, you can:

- Understand how users respond to a new feature
- Figure out where new users come from
- Identify, and decide whether to support, an outlier use case or functionality
- Quantify your project's popularity
- Understand how your project is used
- Raise money through sponsorships and grants

For example, Homebrew finds that Google Analytics helps them prioritize work:

> Homebrew is provided free of charge and run entirely by volunteers in their spare time. As a result, we do not have the resources to do detailed user studies of Homebrew users to decide on how best to design future features and prioritise current work. Anonymous aggregate user analytics allow us to prioritise fixes and features based on how, where and when people use Homebrew.

Popularity isn't everything. Everybody gets into open source for different reasons. If your goal as an open source maintainer is to show off your work, be transparent about your code, or just have fun, metrics may not be important to you.

If you are interested in understanding your project on a deeper level, read on for ways to analyze your project's activity.

### 11.2 Discovery

Before anybody can use or contribute back to your project, they need to know it exists. Ask yourself: *are people finding this project?*

If your project is hosted on GitHub, you can view how many people land on your project and where they come from. From your project's page, click "Insights", then "Traffic". On this page, you can see:

- **Total page views:** Tells you how many times your project was viewed
- **Total unique visitors:** Tells you how many people viewed your project
- **Referring sites:** Tells you where visitors came from. This metric can help you figure out where to reach your audience and whether your promotion efforts are working.
- **Popular content:** Tells you where visitors go on your project, broken down by page views and unique visitors.

GitHub stars can also help provide a baseline measure of popularity. While GitHub stars don't necessarily correlate to downloads and usage, they can tell you how many people are taking notice of your work.

You may also want to track discoverability in specific places: for example, Google PageRank, referral traffic from your project's website, or referrals from other open source projects or websites.

### 11.3 Usage

People are finding your project on this wild and crazy thing we call the internet. Ideally, when they see your project, they'll feel compelled to do something. The second question you'll want to ask is: *are people using this project?*

If you use a package manager, such as npm or RubyGems.org, to distribute your project, you may be able to track your project's downloads.

Each package manager may use a slightly different definition of "download", and downloads do not necessarily correlate to installs or use, but it provides some baseline for comparison. Try using Libraries.io to track usage statistics across many popular package managers.

If your project is on GitHub, navigate again to the "Traffic" page. You can use the clone graph to see how many times your project has been cloned on a given day, broken down by total clones and unique cloners.

If usage is low compared to the number of people discovering your project, there are two issues to consider. Either:

- Your project isn't successfully converting your audience, or
- You're attracting the wrong audience

For example, if your project lands on the front page of Hacker News, you'll probably see a spike in discovery (traffic), but a lower conversion rate, because you're reaching everyone on Hacker News. If your Ruby project is featured at a Ruby conference, however, you're more likely to see a high conversion rate from a targeted audience.

Try to figure out where your audience is coming from and ask others for feedback on your project page to figure out which of these two issues you're facing.

Once you know that people are using your project, you might want to try to figure out what they are doing with it. Are they building on it by forking your code and adding features? Are they using it for science or business?

### 11.4 Retention

People are finding your project and they're using it. The next question you'll want to ask yourself is: *are people contributing back to this project?*

It's never too early to start thinking about contributors. Without other people pitching in, you risk putting yourself into an unhealthy situation where your project is popular (many people use it) but not supported (not enough maintainer time to meet demand).

Retention also requires an inflow of new contributors, as previously active contributors will eventually move on to other things.

Examples of community metrics that you may want to regularly track include:

- **Total contributor count and number of commits per contributor:** Tells you how many contributors you have, and who's more or less active. On GitHub, you can view this under "Insights" -> "Contributors."
- **First time, casual, and repeat contributors:** Helps you track whether you're getting new contributors, and whether they come back. (Casual contributors are contributors with a low number of commits. Whether that's one commit, less than five commits, or something else is up to you.) Without new contributors, your project's community can become stagnant.
- **Number of open issues and open pull requests:** If these numbers get too high, you might need help with issue triaging and code reviews.
- **Number of opened issues and opened pull requests:** Opened issues means somebody cares enough about your project to open an issue. If that number increases over time, it suggests people are interested in your project.
- **Types of contributions:** For example, commits, fixing typos or bugs, or commenting on an issue.

> Open source is more than just code. Successful open source projects include code and documentation contributions together with conversations about these changes.
> -- @arfon, "The Shape of Open Source"

### 11.5 Maintainer Activity

Finally, you'll want to close the loop by making sure your project's maintainers are able to handle the volume of contributions received. The last question you'll want to ask yourself is: *am I (or are we) responding to our community?*

Unresponsive maintainers become a bottleneck for open source projects. If someone submits a contribution but never hears back from a maintainer, they may feel discouraged and leave.

Research from Mozilla suggests that maintainer responsiveness is a critical factor in encouraging repeat contributions.

Consider tracking how long it takes for you (or another maintainer) to respond to contributions, whether an issue or a pull request. Responding doesn't require taking action. It can be as simple as saying: *"Thanks for your submission! I'll review this within the next week."*

You could also measure the time it takes to move between stages in the contribution process, such as:

- Average time an issue remains open
- Whether issues get closed by PRs
- Whether stale issues get closed
- Average time to merge a pull request

### 11.6 Use Metrics to Learn About People

Understanding metrics will help you build an active, growing open source project. Even if you don't track every metric on a dashboard, use the framework above to focus your attention on the type of behavior that will help your project thrive.

CHAOSS is a welcoming, open source community focused on analytics, metrics and software for community health.

---

## 12. The Legal Side of Open Source

*Everything you've ever wondered about the legal side of open source, and a few things you didn't.*

### 12.1 Understanding the Legal Implications of Open Source

Sharing your creative work with the world can be an exciting and rewarding experience. It can also mean a bunch of legal things you didn't know you had to worry about. Thankfully, with this guide you don't have to start from scratch. (Before you dig in, be sure to read our [disclaimer](#13-legal-disclaimer-and-notices).)

### 12.2 Why Do People Care So Much About the Legal Side of Open Source?

Glad you asked! When you make a creative work (such as writing, graphics, or code), that work is under exclusive copyright by default. That is, the law assumes that as the author of your work, you have a say in what others can do with it.

In general, that means nobody else can use, copy, distribute, or modify your work without being at risk of take-downs, shake-downs, or litigation.

Open source is an unusual circumstance, however, because the author expects that others will use, modify, and share the work. But because the legal default is still exclusive copyright, you need to explicitly give these permissions with a license.

These rules also apply when someone contributes to your project. Without a license or other agreement in place, any contributions are exclusively owned by their authors. That means nobody -- not even you -- can use, copy, distribute, or modify their contributions.

Finally, your project may have dependencies with license requirements that you weren't aware of. Your project's community, or your employer's policies, may also require your project to use specific open source licenses.

### 12.3 Are Public GitHub Projects Open Source?

When you create a new project on GitHub, you have the option to make the repository **private** or **public**.

Making your GitHub project public is **not the same** as licensing your project. Public projects are covered by GitHub's Terms of Service, which allows others to view and fork your project, but your work otherwise comes with no permissions.

If you want others to use, distribute, modify, or contribute back to your project, you need to include an open source license. For example, someone cannot legally use any part of your GitHub project in their code, even if it's public, unless you explicitly give them the right to do so.

### 12.4 Just Give Me the TL;DR on What I Need to Protect My Project

You're in luck, because today, open source licenses are standardized and easy to use. You can copy-paste an existing license directly into your project.

**MIT**, **Apache 2.0**, and **GPLv3** are popular open source licenses, but there are other options to choose from. You can find the full text of these licenses, and instructions on how to use them, on [choosealicense.com](https://choosealicense.com).

When you create a new project on GitHub, you'll be asked to add a license.

> A standardized license serves as a proxy for those without legal training to know precisely what they can and can't do with the software. Unless absolutely required, avoid custom, modified, or non-standard terms, which will serve as a barrier to downstream use of the agency code.
> -- @benbalter, "Everything a government attorney needs to know about open source software licensing"

### 12.5 Which Open Source License Is Appropriate for My Project?

It's hard to go wrong with the **MIT License** if you're starting with a blank slate. It's short, easily understood, and allows anyone to do anything so long as they keep a copy of the license, including your copyright notice. You'll be able to release the project under a different license if you ever need to.

Otherwise, picking the right open source license for your project depends on your objectives.

Your project very likely has (or will have) **dependencies**, each of which will have its own open source license with terms you have to respect.

- **Dependencies with permissive licenses** like MIT, Apache 2.0, ISC, and BSD allow you to license your project however you want.
- **Dependencies with copyleft licenses** require closer attention. Including any library with a "strong" copyleft license like the GPLv2, GPLv3, or AGPLv3 requires you to choose an identical or compatible license for your project. Libraries with a "limited" or "weak" copyleft license like the MPL 2.0 and LGPL can be included in projects with any license, provided you follow the additional rules they specify.
- **Dependencies with source-available licenses**, such as the Business Source License BSL or the Server Side Public License SSPL, may appear to be under open source licenses but come with usage and business model restrictions.

Projects often rely on **non-source code content**, such as images, icons, videos, fonts, data files, or other materials, which are governed by their own licenses. The Creative Commons, a non-profit organization, created a series of licenses popular for non-source content, ranging from very permissive CC0 to Permissive CC-BY to copyleft CC-SA.

You may also want to consider the communities you hope will use and contribute to your project:

- **Do you want your project to be used as a dependency by other projects?** Probably best to use the most popular license in your relevant community. For example, MIT is the most popular license for npm libraries.
- **Do you want your project to appeal to large businesses?** A large business may be comforted by an express patent license from all contributors. In this case, the Apache 2.0 has you (and them) covered.
- **Do you want your project to appeal to contributors who do not want their contributions to be used in closed source software?** GPLv3 or (if they also do not wish to contribute to closed source services) AGPLv3 will go over well.

Your company may have policies for open source project licensing. Talk to your company's legal department for guidance.

### 12.6 What If I Want to Change the License of My Project?

Most projects never need to change licenses. But occasionally circumstances change.

There are three fundamental things to consider when adding or changing your project's license:

**It's complicated.** Determining license compatibility and compliance and who holds copyright can get complicated and confusing very quickly. Switching to a new but compatible license for new releases and contributions is different from relicensing all existing contributions. Involve your legal team at the first hint of any desire to change licenses.

**Your project's existing license.** If your project's existing license is compatible with the license you want to change to, you could just start using the new license. That's because if license A is compatible with license B, you'll comply with the terms of A while complying with the terms of B (but not necessarily vice versa). So if you're currently using a permissive license (e.g., MIT), you could change to a license with more conditions, so long as you retain a copy of the MIT license and any associated copyright notices.

**Your project's existing copyright holders.** If you're the sole contributor to your project then either you or your company is the project's sole copyright holder. You can add or change to whatever license you or your company wants to. Otherwise there may be other copyright holders that you need agreement from in order to change licenses. Mozilla took years (2001-2006) to relicense Firefox, Thunderbird, and related software.

### 12.7 Does My Project Need an Additional Contributor Agreement?

Probably not. For the vast majority of open source projects, an open source license implicitly serves as both the inbound (from contributors) and outbound (to other contributors and users) license. If your project is on GitHub, the GitHub Terms of Service make "inbound=outbound" the explicit default.

An additional contributor agreement -- often called a Contributor License Agreement (CLA) -- can create administrative work for project maintainers.

> We have eliminated the CLA for Node.js. Doing this lowers the barrier to entry for Node.js contributors thereby broadening the contributor base.
> -- @bcantrill, "Broadening Node.js Contributions"

Some situations where you may want to consider an additional contributor agreement for your project include:

- Your lawyers want all contributors to expressly accept (sign, online or offline) contribution terms. The **jQuery Individual Contributor License Agreement** is a good example of a lightweight additional contributor agreement.
- You or your lawyers want developers to represent that each commit they make is authorized. A **Developer Certificate of Origin** requirement is how many projects achieve this.
- Your project uses an open source license that does not include an express patent grant (such as MIT), and you need a patent grant from all contributors. The **Apache Individual Contributor License Agreement** is a commonly used additional contributor agreement that has a patent grant mirroring the one found in the Apache License 2.0.
- Your project is under a copyleft license, but you also need to distribute a proprietary version of the project. You'll need every contributor to assign copyright to you or grant you (but not the public) a permissive license.
- You think your project might need to change licenses over its lifetime and want contributors to agree in advance to such changes.

If you do need to use an additional contributor agreement with your project, consider using an integration such as CLA assistant to minimize contributor distraction.

### 12.8 What Does My Company's Legal Team Need to Know?

If you're releasing an open source project as a company employee, first, your legal team should know that you're open sourcing a project.

For better or worse, consider letting them know even if it's a personal project. You probably have an "employee IP agreement" with your company that gives them some control of your projects, especially if they are at all related to the company's business or you use any company resources to develop the project.

If you're open sourcing a project for your company, then definitely let them know. Your legal team probably already has policies for what open source license (and maybe additional contributor agreement) to use.

Some things to think about:

- **Third party material:** Does your project have dependencies created by others or otherwise include or use others' code? If these are open source, you'll need to comply with the materials' open source licenses.
- **Trade secrets:** Consider whether there is anything in the project that the company does not want to make available to the general public.
- **Patents:** Is your company applying for a patent of which open sourcing your project would constitute public disclosure?
- **Trademarks:** Double check that your project's name does not conflict with any existing trademarks. FOSSmarks is a practical guide to understanding trademarks in the context of free and open source projects.
- **Privacy:** Does your project collect data on users? "Phone home" to company servers? Your legal team can help you comply with company policies and external regulations.
- **AI:** As AI models and functionality become integral to software, it is crucial to understand licensing agreements and relevant legislation controlling their use.
- **Software Bill of Materials:** A Software Bill of Materials (SBOM) is a comprehensive list of third-party dependencies, versions, associated licenses, and other metadata. SBOMs are legally mandated in certain countries, industries, or due to contractual obligations.

Longer term, your legal team can do more to help the company get more from its involvement in open source, and stay safe:

- **Employee contribution policies:** Consider developing a corporate policy that specifies how your employees contribute to open source projects.

> Letting out the IP associated with a patch builds the employee's knowledge base and reputation. It shows that the company is invested in the development of that employee and creates a sense of empowerment and autonomy. All of these benefits also lead to higher morale and better employee retention.
> -- @vanl, "A Model IP and Open Source Contribution Policy"

- **What to release:** (Almost) everything? If your legal team understands and is invested in your company's open source strategy, they'll be best able to help rather than hinder your efforts.
- **Compliance:** Even if your company doesn't release any open source projects, it uses others' open source software. Awareness and process can prevent headaches, product delays, and lawsuits.

> Organizations must have a license and compliance strategy in place that fits both ["permissive" and "copyleft"] categories. This begins with keeping a record of the licensing terms that apply to the open source software you're using -- including subcomponents and dependencies.
> -- Heather Meeker, "Open Source Software: Compliance Basics And Best Practices"

- **Patents:** Your company may wish to join the Open Invention Network, a shared defensive patent pool to protect members' use of major open source projects, or explore other alternative patent licensing.
- **Governance:** Especially if and when it makes sense to move a project to a legal entity outside of the company.

---

## 13. Legal Disclaimer and Notices

### 13.1 Legal Disclaimer

**GitHub is not a law firm.** As such, GitHub does not provide legal advice. The material in this guide does not constitute legal advice nor does contributing to the guide or communicating with GitHub or other contributors about the guide create an attorney-client relationship.

Open source projects are made available and contributed to under licenses that include terms that, for the protection of contributors, make clear that the projects are offered "as-is", without warranty, and disclaiming liability for damages resulting from using the projects. This guide is no different. The open content license it is offered under includes such terms.

Running an open source project, like any human endeavor, involves uncertainty and trade-offs. We hope this guide helps, but it may include mistakes, and can't address every situation. If you have any questions about your project, we encourage you to do your own research, seek out experts, and discuss with your community. If you have any legal questions, you should consult with your own legal counsel before moving forward. If you're at a company, talk to its legal team.

### 13.2 Licenses

Content is copyright Open Source Guides authors, released under **CC-BY-4.0**, which gives you permission to use content for almost any purpose (but does not grant you any trademark permissions), so long as you note the license and give credit, such as follows:

> *Content based on github.com/github/opensource.guide used under the CC-BY-4.0 license.*

Code, including source files and code samples if any in the content, is released under **CC0-1.0**, with the following exceptions:

- The primer components in `node_modules` are under the MIT license; see LICENSE in each component's directory
- The Octicons images are under the SIL OFL 1.1

This means you can use the code and content in this repository except for GitHub trademarks in your own projects. When using the GitHub logos, be sure to follow the GitHub logo guidelines.

When you contribute to this repository you are doing so under the above licenses.

### 13.3 Permissions

Screenshots and images from other projects are used with permissions below.

**Django:**

Copyright Django Software Foundation and individual contributors. All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
3. Neither the name of Django nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

**Vagrant:**

The MIT License

Copyright 2010-2016 Mitchell Hashimoto

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

Public speaking photo used with permission of Zeeshaan Kaleem and released under CC-BY-4.0.