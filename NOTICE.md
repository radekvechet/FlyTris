# Licensing, attribution and provenance

## FlyTris code

Except for the third-party code and data described below, FlyTris's original
source code is licensed under **GPL-2.0-or-later**: GNU General Public License
version 2, or (at your option) any later version. See [LICENSE](LICENSE).
It is provided without warranty, including implied warranties of merchantability
or fitness for a particular purpose. Preserve licence and attribution notices
when redistributing it and make corresponding source available as required by GPL.

## Upstream simulator

Source: [eonsystemspbc/fly-brain](https://github.com/eonsystemspbc/fly-brain/tree/a3db62f9436074e485c0278290c2164ed6150808),
pinned commit `a3db62f9436074e485c0278290c2164ed6150808`.
Its [licensing statement](https://github.com/eonsystemspbc/fly-brain/blob/a3db62f9436074e485c0278290c2164ed6150808/README.md#license)
specifies GPL-2.0-or-later with exceptions for identified third-party materials.
This is the Eon PyTorch implementation used by FlyTris's upstream benchmark;
the original Shiu Brian2 materials have a separate MIT notice upstream.

`python -m flytris fetch` downloads unmodified `code/run_pytorch.py` as
`vendor/run_pytorch.py`, together with `vendor/LICENSE`. Downloaded upstream files
are excluded from Git; portable archives may include them. Keep their notices.
[data/source.json](data/source.json) records exact URLs, sizes and SHA-256 hashes.

The training adapter is an independent normalized LIF reservoir, with changed
time constants, synthetic input mapping, weight normalization and readout.
`benchmark-upstream` executes unmodified model classes/constants extracted from
the pinned source. Neither experiment establishes biological learning or an
advantage of fly topology. This project is not endorsed by the upstream authors.

## Connectome data

FlyWire public v783 data is **CC BY-NC 4.0**, separately from the code licence.
See the [official FlyWire guidelines](https://home.flywire.ai/guidelines) and
[data attribution and transformations](site-data/DATA_NOTICE.md). The GPL grant
does not relicense the dataset or remove its noncommercial restriction.

## Three.js

The report bundles Three.js 0.185.0 under **MIT**, with the original notice in
[THREE-LICENSE.txt](flytris/web/third_party/THREE-LICENSE.txt).
[source.json](flytris/web/third_party/source.json) records official npm-distribution
URLs via jsDelivr and SHA-256 hashes. Retain that notice with the bundled library.
Fly and handheld visuals are procedural illustrations; no external 3D models
or reference photographs are distributed as game assets.

Python and npm dependencies retain their own licences. They are installed by
the package managers and are not vendored in this source repository.
