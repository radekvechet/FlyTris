# FlyWire data attribution

The FlyWire Consortium, Princeton University and collaborating researchers
created the public adult fly connectome used here. FlyWire states that its
public release, including **v783**, is licensed under **CC BY-NC 4.0**.
Source: [FlyWire citation guidelines](https://home.flywire.ai/guidelines).
Licence: [Attribution–NonCommercial 4.0 International](https://creativecommons.org/licenses/by-nc/4.0/).
Sharing/adaptation requires attribution, a licence link, identification of changes
and noncommercial use. No endorsement is implied.

FlyTris obtains the v783 tables through the pinned Eon repository documented in
[../data/source.json](../data/source.json). It extracts a 256-neuron subgraph,
retains signed directed connectivity, normalizes incoming weights, and exports
that circuit inside `versus-model.json`. Those connectome-derived contents retain
the data terms; they are not relicensed under GPL. The model also contains a
synthetic encoder and experimentally trained readout weights. This notice does
not assert that every training output is itself a derivative of the dataset.

Credit the relevant research:

- Dorkenwald et al. (2024), *Neuronal wiring diagram of an adult brain*.
  [Nature](https://doi.org/10.1038/s41586-024-07558-y).
- Schlegel et al. (2024), *Whole-brain annotation and multi-connectome cell typing
  of Drosophila*. [Nature](https://doi.org/10.1038/s41586-024-07686-5).
- Shiu et al. (2024), *A Drosophila computational brain model reveals sensorimotor
  processing*. See the paper linked from the
  [upstream repository](https://github.com/eonsystemspbc/fly-brain/tree/a3db62f9436074e485c0278290c2164ed6150808).

Keep this notice alongside redistributed model snapshots. The other files in
this directory are generated experiment reports, replay/shape data and build
inputs; local leaderboard databases are not included.
