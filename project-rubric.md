Overview
In the final group project, you will complete a data visualization project from scratch, from identifying meaningful questions and acquiring data to designing, implementing, and communicating insights through interactive visualizations.

The final project should be more than a collection of five charts. Your visualizations should work together to tell a coherent data-driven story. A strong project starts with meaningful questions, uses appropriate data and visualization techniques to investigate those questions, and guides the audience toward important patterns, relationships, comparisons, or conclusions.

Your project should demonstrate both technical competence and visualization reasoning.

1. Topic, Questions, and Visualization Goals
Identify a meaningful topic and formulate one or more research, analytical, or exploratory questions.

Examples might include:

How are education and income related across different populations?
How has public discussion of a social issue changed over time?
What patterns characterize transportation behavior across cities?
How do countries differ in health, economic, and demographic indicators?
Your project should have a clear motivation. Avoid selecting a dataset first and simply creating charts from the available columns.

Clearly define:

Why: Why is this topic meaningful? Why should your audience care?
What: What data and attributes are needed to investigate it?
How: How will visualization help people explore or understand the questions?
Your visualization goals should guide your decisions throughout the project.

2. Data Acquisition, Cleaning, and Analysis
You may either collect your own data or use existing datasets.

Possible data sources include APIs, public websites, social media, government databases, WHO, academic databases, commercial websites, and open-data repositories.

If you collect an original dataset, your group should generally aim for:

at least 10,000 data items;
at least three meaningful variables;
multiple attribute types, such as categorical, ordinal, and numerical variables.
You should document how the data were collected, cleaned, filtered, transformed, and analyzed. Submit both the original/source dataset and cleaned dataset, when applicable.

Using an existing downloadable dataset is acceptable. However, because less work is required for data acquisition, higher expectations will be placed on the depth, quality, and sophistication of your analysis and visualization design.

3. Visualization Requirements
Create at least five interactive visualizations that collectively address your visualization goals.

Multiple Visualization Idioms
Your five visualizations should use meaningful and appropriately selected visualization idioms. Avoid creating five minor variations of the same basic chart.

At least one visualization must use a relatively complex representation, such as:

network or graph visualization;
hierarchical visualization or treemap;
text visualization;
geographic visualization;
multidimensional visualization;
non-linear temporal visualization; or
another visualization technique with comparable complexity.
If you are unsure whether your proposed visualization qualifies, consult the teaching team.

Interaction
Across the complete project, implement at least five meaningful interactions.

Examples include:

filtering;
sorting;
highlighting;
brushing and linking;
selection;
zooming and panning;
details on demand;
changing variables or views;
coordinated interactions across multiple visualizations.
A tooltip can be useful, but simply adding tooltips to every chart does not demonstrate thoughtful interaction design. Interactions should help users accomplish meaningful tasks or explore the data.

All visualizations and interactions should be generated programmatically, primarily using D3.js or other approved programming languages/libraries.

4. Storytelling and Meaningfulness
Your final project should communicate a coherent story through data.

The five visualizations should not function as five independent assignments. Instead, consider how a viewer moves through your project:

Context → Overview → Important Pattern → Deeper Exploration → Insight/Conclusion

For example, one visualization might establish the overall trend, another compare important groups, another reveal relationships between variables, and a final visualization provide a deeper examination of an unexpected pattern.

Your project should help the audience understand:

What is happening?
Where or when is it happening?
Who or what is involved?
What important relationships or differences exist?
Why might these patterns matter?
Use titles, annotations, short explanatory text, highlighting, and visual hierarchy where appropriate to guide the audience through the story.

A technically sophisticated visualization is not automatically a meaningful visualization. Your project should generate insights that are relevant to your original questions and useful or interesting to your intended audience.

Avoid projects that simply visualize obvious statistics without providing opportunities for deeper interpretation.

5. Dashboard / Visualization Website
Integrate the visualizations into a single coherent HTML website or dashboard.

The interface should not simply place five charts next to each other. Consider:

visual hierarchy and layout;
navigation or storytelling sequence;
consistency of visual design;
annotations and explanatory text;
relationships between visualizations;
coordinated interactions where appropriate.
Publish the final project so that it can be accessed through a browser, preferably through your project GitHub Pages website.

Final Report
Submit a final report of approximately 1,500 words.

The report should contain the following sections.

Introduction
Describe:

project motivation and context;
visualization goals and/or research questions;
intended audience;
why visualization is appropriate or important for addressing these questions.
Method
Explain your technical approach, including:

data sources and acquisition;
crawling/API methods where applicable;
data cleaning and filtering;
data transformation and analysis;
visualization technologies and implementation.
Results
Present your five visualizations and major interactions.

For each visualization, briefly explain:

what it shows;
what question or visualization goal it addresses;
what users can do with it;
what important patterns or insights it reveals.
Screenshots of the final visualizations should be included.

Discussion
Critically evaluate your visualization design.

Where appropriate, use the What–Why–How framework introduced in class:

What: What data and attributes are represented?
Why: What user tasks or goals does the visualization support?
How: What visual idioms, marks, channels, and interactions are used?
Discuss the strengths and weaknesses of your design, effectiveness of interactions, limitations, and possible improvements.

Conclusion
Return to your original questions and summarize the most important findings.

Explain how the complete visualization contributes to knowledge generation, understanding, exploration, decision-making, or communication.

The conclusion should focus on what your audience can learn from the project rather than simply stating that five visualizations were successfully created.

Roles and Responsibilities
Clearly state the contributions and responsibilities of each team member.

Final Presentation and Showcase
Each group will present and demonstrate the working visualization project during the final presentation/showcase.

Your presentation should focus on the story rather than walking through every implementation detail.

A recommended presentation flow is:

Motivation → Questions → Data → Visualization Story → Key Insights → Conclusion

Demonstrate important interactions live and explain how they help the audience explore or understand the data.

Deliverables
Each group should submit:

Source dataset(s)
Cleaned/processed dataset(s)
Data collection or crawler code, if applicable
Data cleaning and analysis code
Complete visualization source code
Published visualization website/dashboard
Final report (~1,500 words)
Final project poster
Any additional documentation necessary to reproduce the project
Only one complete submission per group is required.

Assessment
Criterion

Weight

What We Will Evaluate

Data Acquisition & Analysis

15%

Quality and appropriateness of the dataset; collection effort; cleaning, transformation, and analysis; documentation and reproducibility.

Visualization Design & Effectiveness

25%

Appropriate visual idioms, marks, channels, accuracy, readability, and effectiveness in supporting visualization goals and user tasks.

Technical Implementation & Interaction

20%

Technical difficulty, correct implementation, meaningful interactions, D3.js/programmatic visualization, and completeness of the final system.

Storytelling & Meaningfulness

15%

Coherence of the visualization story, importance of the questions, connections among the five visualizations, quality of insights, and ability to communicate why the findings matter.

Final Report

10%

Clear documentation of motivation, methods, results, design rationale, discussion, conclusions, and team contributions.

Presentation & Demo

10%

Clear communication of the project story, effective demonstration of visualizations and interactions, and ability to explain findings and design choices.

Completeness & Documentation

5%

Complete submission of datasets, code, website, poster, report, and supporting materials.

Total: 100%

Technical complexity is valuable when it serves the visualization goals. However, complexity by itself is not the objective. A successful project uses appropriate visualization and interaction techniques to transform data into a clear, coherent, and meaningful visual story.