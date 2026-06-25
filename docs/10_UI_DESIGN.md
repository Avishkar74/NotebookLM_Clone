# **10\_UI\_DESIGN.md**

# **User Interface Design Specification**

**Version:** 1.0

---

# **Purpose**

The UI is designed to do more than answer questions.

Its primary goal is to **teach users how Corrective RAG works** by visualizing the complete execution of the system while maintaining a clean and modern interface.

The application is intentionally designed as a **single-page dashboard** where every component has one clearly defined responsibility.

---

# **Design Principles**

The UI follows these principles:

* Minimal and uncluttered  
* Desktop-first  
* Modern dashboard aesthetic  
* Educational visualization  
* Interactive pipeline exploration  
* Separation of concerns  
* Responsive component layout  
* No unnecessary navigation

The interface should feel similar to products such as

* Claude  
* Linear  
* Vercel  
* LangSmith  
* LangGraph Studio

---

# **Overall Layout**

The application consists of **one dashboard**.

There are **no additional pages**, authentication screens, or navigation menus.

┌──────────────────────────────────────────────────────────────────────────────────────────┐

│                                Corrective RAG Dashboard                                 │

├───────────────┬──────────────────────────────────────┬───────────────────────────────────┤

│               │                                      │                                   │

│               │                                      │                                   │

│               │                                      │                                   │

│ Documents     │            Chat Interface            │      Pipeline Visualization        │

│               │                                      │                                   │

│               │                                      │                                   │

│               │                                      │                                   │

├───────────────┴──────────────────────────────────────┴───────────────────────────────────┤

│                                                                                          │

│                          Node Output Inspector                                            │

│                                                                                          │

└──────────────────────────────────────────────────────────────────────────────────────────┘

---

# **Dashboard Layout**

## **Left Panel**

Purpose

Document Management only.

Responsibilities

* Upload documents  
* Show upload progress  
* Show processing queue  
* Show completed documents

Must NOT contain

* Chat history  
* Login  
* Settings  
* Navigation  
* Profile  
* Search

---

## **Center Panel**

Purpose

Conversation with the AI.

Responsibilities

* Display messages  
* Show temporary processing indicator  
* User input  
* Final answer

Must NOT display

* Node outputs  
* Technical logs  
* Pipeline details

---

## **Right Panel**

Purpose

Visualize CRAG execution.

Responsibilities

* Animated graph  
* Active node  
* Branch visualization  
* Clickable nodes

---

## **Bottom Panel**

Purpose

Inspect the selected node.

Responsibilities

* Node input  
* Node output  
* Metadata  
* Execution information

---

# **Page Structure**

The application contains only one page.

Dashboard

├── Documents Panel

├── Chat Panel

├── Pipeline Panel

└── Node Output Inspector

---

# **Component Hierarchy**

Dashboard

├── DocumentsPanel

│

│   ├── UploadCard

│   │

│   ├── ProcessingQueue

│   │

│   └── CompletedDocuments

│

├── ChatPanel

│

│   ├── MessageList

│   │

│   ├── ProcessingIndicator

│   │

│   └── ChatInput

│

├── PipelinePanel

│

│   ├── GraphCanvas

│   │

│   ├── Nodes

│   │

│   └── Connections

│

└── NodeInspector

    │

    ├── Header

    │

    ├── Output

    │

    └── Metadata

---

# **Documents Panel**

## **Initial State**

┌────────────────────────────┐

      Upload Document

   Upload PDF / TXT Files

└────────────────────────────┘

Processing Queue

Empty

Completed Documents

None

---

## **Upload Interaction**

The upload component itself becomes the ingestion visualization.

┌────────────────────────────┐

attention.pdf

Parsing PDF...

└────────────────────────────┘

↓

Extracting Text...

↓

Creating Chunks...

↓

Generating Embeddings...

↓

Storing in Qdrant...

↓

Ready ✓

Once complete,

the upload component returns to

Upload Document

---

# **Multiple Uploads**

Users may upload multiple files simultaneously.

However,

documents are processed sequentially.

Upload Queue

attention.pdf

↓

rag.pdf

↓

notes.pdf

Only one file moves through the ingestion pipeline at a time.

The remaining files wait in the queue.

---

# **Completed Documents**

Display only basic information.

Example

Completed

✓ attention.pdf

✓ rag.pdf

✓ notes.pdf

Optional

* Chunk count  
* File size

No additional actions are required.

---

# **Chat Panel**

The chat is intentionally minimal.

┌──────────────────────────────┐

User

What is Multi-Head Attention?

──────────────────────────────

Assistant

Retrieving...

──────────────────────────────

Answer appears here.

└──────────────────────────────┘

---

# **Temporary Processing Indicator**

The processing indicator behaves exactly like modern AI assistants.

It is NOT a checklist.

It is NOT a timeline.

Only one message exists.

Example

Retrieving...

↓

Evaluating...

↓

Generating...

↓

Answer

The previous status disappears before the next one appears.

The final answer replaces the temporary indicator.

---

# **Chat Input**

┌─────────────────────────────────────┐

Ask anything about your uploaded documents...

                             \[Send\]

└─────────────────────────────────────┘

---

# **Pipeline Visualization**

The graph visualizes the execution of the CRAG pipeline.

                Retriever

                      │

                      ▼

          Retrieval Evaluator

           /       │       \\

          /        │        \\

   Correct    Ambiguous    Incorrect

        │          │            │

        ▼          ▼            ▼

Knowledge      Knowledge     Query

Refinement      Search      Rewrite

         \\         │          /

          \\        ▼         /

             Final Generator

                   │

                   ▼

                 Answer

---

# **Graph Behavior**

The graph is animated.

Node States

| State | Appearance |
| ----- | ----- |
| Pending | Neutral |
| Running | Animated \+ Highlighted |
| Completed | Green |
| Failed | Red |
| Skipped | Faded |

Only the executed branch becomes active.

Example

If the Evaluator returns

AMBIGUOUS

Then

Retriever

↓

Evaluator

↓

Knowledge Refinement

↓

Knowledge Search

↓

Generator

animates.

The Correct and Incorrect branches remain inactive.

---

# **Graph Interaction**

Every node is clickable.

User clicks

Retriever

↓

Bottom panel updates.

User clicks

Generator

↓

Bottom panel updates.

The graph itself never changes layout.

Only the inspector changes.

---

# **Node Output Inspector**

Initially

Select a node to inspect its output.

---

Example

Retriever

Retriever

Output

Retrieved Chunks

Top-K

Similarity Scores

Metadata

---

Evaluator

Decision

Confidence

Reasoning

---

Knowledge Refinement

Input Chunks

Output Chunks

Refined Context

---

Knowledge Search

Rewritten Query

Results Found

Selected Results

---

Generator

Prompt

Context

Model

Generated Response

The inspector always displays only the selected node.

---

# **Interaction Flow**

## **Upload Flow**

User

↓

Click Upload

↓

Select Files

↓

Processing Queue

↓

Ingestion Animation

↓

Ready

↓

Document Appears in Completed List

---

## **Query Flow**

User

↓

Enter Question

↓

Retrieving...

↓

Evaluating...

↓

Generating...

↓

Final Answer

Simultaneously

Pipeline Graph Animates

↓

Nodes Complete

↓

User Clicks Node

↓

Inspector Updates

---

# **User Experience Flow**

Open Application

↓

Upload Documents

↓

Wait Until Ready

↓

Ask Question

↓

Observe Graph Animation

↓

Read Answer

↓

Inspect Individual Nodes

↓

Ask Next Question

The workflow is intentionally linear and easy to follow.

---

# **Empty States**

## **No Documents**

No documents uploaded.

Upload a PDF or TXT file to begin.

---

## **No Chat**

Ask a question about your uploaded documents.

---

## **No Node Selected**

Select a node from the execution graph to inspect its output.

---

# **Loading States**

## **Upload**

Parsing PDF...

Extracting Text...

Creating Chunks...

Generating Embeddings...

Storing in Qdrant...

---

## **Query**

Retrieving...

↓

Evaluating...

↓

Generating...

Only one loading message is visible at any time.

---

# **Error States**

## **Upload Failure**

Upload Failed

Unable to process document.

---

## **Query Failure**

Unable to generate response.

Please try again.

---

## **Pipeline Failure**

Failed node becomes red.

Inspector displays

* Error  
* Message  
* Recovery suggestion

---

# **Visual Style**

Typography

* Large readable headings  
* Medium-weight labels  
* Comfortable spacing

Colors

* Neutral backgrounds  
* Blue primary accent  
* Green success  
* Amber processing  
* Red error

Components

* Rounded corners  
* Soft shadows  
* Consistent spacing  
* Subtle animations

Animations

* Fade  
* Glow  
* Pulse  
* Smooth transitions

Avoid excessive motion.

---

# **Responsive Design**

Primary target

Desktop (1920×1080 and above)

Behavior

Large Desktop

All four panels visible

Tablet

Bottom panel collapsible

Mobile (optional)

Stacked layout

Documents

↓

Chat

↓

Pipeline

↓

Inspector

Desktop remains the primary experience.

---

# **Information Separation**

Each panel has one responsibility.

| Panel | Responsibility |
| ----- | ----- |
| Documents | Upload and document management |
| Chat | Conversation only |
| Pipeline | Execution visualization |
| Inspector | Technical details |

Information must never be duplicated across panels.

---

# **Design Philosophy**

The interface is designed to make the CRAG pipeline understandable without overwhelming the user.

Rather than displaying every technical detail at once, information is progressively disclosed:

* **Documents Panel** manages ingestion.  
* **Chat Panel** focuses on the conversation.  
* **Pipeline Panel** visualizes execution.  
* **Node Output Inspector** exposes detailed technical information on demand.

This separation keeps the dashboard clean, intuitive, and educational while allowing users to explore the internals of the system when they choose.

