---
title: "Why I Built The KillerPDF.Engine"
date: 2026-08-28T19:59:48-07:00
description: "Why I built The KillerPDF.Engine and what I learned replacing KillerPDF's legacy document pipeline."
tags:
  - C#
  - .NET
  - PDF
  - open source
  - KillerPDF
draft: false
toc: true
readingTime: true
---
KillerPDF had reached the point where its PDF library was deciding what the application could become *but I wanted more*.

So I did the reasonable thing and wrote a PDF engine.<br>
Okay, maybe not the *reasonable* thing but I wrote one anyway, in C# on .NET 10.<br>
The result is **The KillerPDF.Engine**.<br>

It handles parsing, validation, authoring, structural editing, encryption, signing, and serialization.<br>
It has no user interface and no dependency on the KillerPDF desktop application and it's available as a public GPLv3 [NuGet package](https://www.nuget.org/packages/KillerPdf.Engine/1.8.0).

## Why replace something that worked?

PdfSharpCore wasn't bad software but it was just the wrong foundation for where I wanted to take KillerPDF.

I was already maintaining several preservation fixes in a vendored copy.<br>
They stopped ordinary saves from rewriting metadata, injecting transparency groups, producing incorrect stream lengths, or reducing PDF/A conformance but patches couldn't change the shape of the library underneath them and PDF 2.0 support is *much* larger than accepting a `%PDF-2.0` header.

I could keep extending the old writer or move to another complete library and both would've been easier in the short term.<br>
Neither would've given me control over the part of KillerPDF I cared about most.

I've supported open source software for about 30 years, so the engine was always going to be public and GPLv3. That shaped the boundary from the start.<br>
The KillerPDF.Engine doesn't reference WPF, the KillerPDF interface, PDFium, PdfPig, PdfSharpCore, or PDFsharp. It targets .NET 10 and sticks to cross-platform runtime APIs.

KillerPDF is still a Windows application, but its document model no longer is and that removes one large problem from the eventual cross-platform port.

## This is where PDF gets weird

A PDF page is not self-contained. It can point to fonts, images, annotations, form fields, bookmarks, attachments, structure elements, inherited properties, and plenty more and any of those objects can point somewhere else.

Moving a page between PDFs therefore isn't copying a page dictionary and its content stream. The engine has to walk the reachable object graph, import what belongs to the page, assign new identities, and rewrite every reference. It also has to stop safely when a real-world PDF contains circular references, broken references, or malformed structures.

Forms made this worse. Tagged documents made it worse again. A page can look completely fine on screen while its relationships underneath are broken, and a renderer might never reveal it.

*Then signatures got involved...*

A signed PDF contains old revisions whose exact bytes must survive. Editing one means appending a new revision without touching the signed byte ranges.<br>
Even when the signature still verifies, certification rules and field locks may forbid the edit.<br>
Encryption adds another identity problem because renumbering an object without applying the correct key can produce a file that looks plausible but won't open.

Standards support was the same song. Anyone can write `PDF/A-4` into metadata but that doesn't make the file PDF/A-4.<br>
The engine blocks encryption for PDF/A, requires XMP metadata and an ICC output intent, requires embedded fonts for PDF/A text, and checks PDF/UA-2 structure.<br>
veraPDF still gets the final word, but the API should stop obvious nonsense before it reaches a validator.

## Letting 2,907 hostile PDFs take a swing at it

The engine has 1,436 automated tests, but unit tests weren't enough.<br>
I ran KillerPDF's complete save pipeline against 2,907 files from the public veraPDF, Isartor, and TWG conformance suites. Most are malformed on purpose or built to violate one exact standards requirement.<br>
They are PDFs designed to ruin your afternoon, which made them perfect for this.

KillerPDF rewrote 2,898 files. Nine were skipped because they were encrypted or didn't contain enough reliable structure for a safe rewrite. Every output then went through veraPDF and qpdf.

- Zero new veraPDF conformance failures
- Zero qpdf structural regressions
- 74 files became more conformant after rewriting
- 374 files with existing qpdf warnings came out clean

I wasn't trying to repair the corpus. Those improvements were a side effect of producing consistent trailers, cross-reference data, and stream lengths.

The number I cared about was zero.

**Not one successfully rewritten file became worse.**

## Was it faster?

I had replaced a mature pipeline with a new one, so there was a chance I had made it slower. I compared the released KillerPDF 1.7.5 and 1.8.0 builds using the same 2,236-file corpus on the same machine. The benchmark used only the files supported by both versions because KillerPDF 1.7.5 couldn't process the PDF 2.0 files included in the full corpus.

Each version got one warmup run followed by five measured runs. I alternated their order, used fresh output directories, and compared the median instead of picking the best result.

- **CPU:** AMD Ryzen 5 3600 6-Core Processor
- **Memory:** 32 GB DDR4-3200
- **Storage:** 2 TB SPCC M.2 PCIe NVMe SSD

| Version | Median time | Median files per second |
| --- | ---: | ---: |
| KillerPDF 1.7.5 | 16.167 seconds | 138.31 |
| KillerPDF 1.8.0 | 10.013 seconds | 223.32 |

**KillerPDF 1.8.0 finished this workload about 38.1% faster.**<br>
That isn't a universal PDF benchmark, it's KillerPDF's real batch-resave path on one defined corpus, with the method and numbers included so nobody has to take a marketing sentence on faith.

## Why make it public?

There are mature commercial PDF libraries for .NET but open choices focused on modern PDF 2.0, PDF/A, and PDF/UA authoring are a much shorter list.

I think competition is good for everybody and developers now get another implementation they can inspect, test, criticize, improve, and use.<br>
If a free library handles difficult documents well, maybe it also gives the big vendors and older projects a reason to get better.<br>
A rising tide should raise all ships.

The engine is still young and doesn't replace every PDF component. PDFium remains the renderer, while PdfPig provides positioned text and image extraction.

PdfPig may be next on the chopping block but replacing it means interpreting content streams, tracking graphics state and transformations, decoding fonts, and supporting ToUnicode CMaps. That's a real project, not a weekend cleanup, but it would remove another major dependency before the cross-platform work begins.

## What I learned

A PDF is not really a text file... it's closer to a database.

What looks like a page of text on the screen is actually a collection of numbered objects connected through references and located through an index.<br>
Fonts, images, annotations, forms, signatures, encryption settings, metadata, and even the page itself may live in different objects.<br>
Some of those objects are compressed.<br>
Some inherit values from other objects.<br>
A file can contain *several* historical revisions at once.

This should change how you think about editing one.

You aren't opening a document, changing a sentence, and saving it again.<br>
You are modifying a connected data structure while preserving everything you didn't touch.<br>
You have to rebuild indexes, maintain references, calculate stream lengths, and respect encryption, while avoiding invalidating signatures or standards conformance.

Writing The KillerPDF.Engine taught me why PDF software becomes complicated so quickly... The visible page is almost the *least* interesting part of the file.

**A PDF is a database wearing a piece of paper as a disguise.**
<br><br><br><br><br><br>
## Project links

- Engine documentation: [https://killerpdf.net/engine/](https://killerpdf.net/engine/)
- NuGet: [https://www.nuget.org/packages/KillerPdf.Engine/1.8.0](https://www.nuget.org/packages/KillerPdf.Engine/1.8.0)
- Source: [https://github.com/SteveTheKiller/KillerPDF](https://github.com/SteveTheKiller/KillerPDF)
- Validation results: [https://github.com/SteveTheKiller/KillerPDF/blob/main/validation/RESULTS.md](https://github.com/SteveTheKiller/KillerPDF/blob/main/validation/RESULTS.md)
- Performance results: [https://github.com/SteveTheKiller/KillerPDF/blob/main/validation/PERFORMANCE.md](https://github.com/SteveTheKiller/KillerPDF/blob/main/validation/PERFORMANCE.md)
