# Bốn vai: Human, Supervisor, Lead, Peer

> Tổng hợp từ `LEAD.md`, `PEER.md`, `supervisor_instruction.txt` (seatworks/codex-room) và
> README `pi-paseo-orchestration`. Đây là chân dung "lý tưởng" của từng vai — mỗi bộ harness
> triển khai hơi khác nhưng cùng xương sống.

## Sơ đồ quyền

```
HUMAN (owner)
 │  quyết: product direction, portfolio priority, trade-off không đảo ngược,
 │        external side effect ra khỏi máy, accept việc Lead tự viết
 │
 ├── SUPERVISOR (giám quá trình)        [tùy chọn — không phải lúc nào cũng cần]
 │     chỉ quan sát · tư vấn Lead · không code · không accept project
 │
 ├── LEAD (trọng tài kỹ thuật của project)
 │     framing → chẻ việc → routing → ownership → dependency → review →
 │     integration → ACCEPTANCE
 │
 └── PEER × N (đồng nghiệp độc lập)
       một bounded outcome mỗi lượt · disposition trong brief ·
       phán đoán riêng · commit local · không orchestration tools
```

## Human / Owner

- Giữ quyền **owner**: hướng product, thứ tự ưu tiên, mọi trade-off không đảo ngược, mọi thứ
  ra khỏi máy (push, deploy, gọi service ngoài, sửa config toàn cục).
- **Commit local thì không phải của Human** — nó đảo ngược được (`reset`, `revert`) nên thuộc
  về Peer. Đường phân ranh là *khả năng đảo ngược*, không phải *tên lệnh git*.
- Trong seatworks, Human chỉ nhận hai loại việc từ Lead: accept `LEAD-WROTE` và quyết những
  thứ Lead trả về `BLOCKED` (cần Human).

## Supervisor

- **Bảo vệ chất lượng quá trình, không phải chất lượng sản phẩm.** Không implement, không
  chạy validation của project, không quyết kết quả kỹ thuật.
- Việc chính: **quan sát + tư vấn Lead**. Nhìn các dấu hiệu xấu: micro-scoped work orders,
  pre-solving, staffing theo template, review không có uncertainty thật, polling đốt context,
  permission loops, trả về Human những quyết Lead lẽ ra tự chấm.
- Chỉ can thiệp khi tư vấn có thể *cải thiện hành động kế tiếp của Lead*; gửi advice cho
  Lead, không nhắn thẳng worker. "Không lập chuỗi chỉ huy song song chỉ vì truy cập trực
  tiếp tiện hơn."
- Có **notebook** ghi học liệu cross-workspace (`SUPERVISOR_NOTEBOOK.md`): chỉ append bằng
  chứng mới hoặc mạnh hơn, tổng hợp theo pattern; không được mutate protocol khi đang chỉ
  giám sát.
- Supervisor **không phải tầng luôn bật** — task nhỏ chạy Lead-only (pi-paseo-orchestration:
  "root Supervisor is created only when warranted"). Từ 9/2026 có đường thứ ba:
  **[paseo-supervision](../04-case-studies/05-paseo-supervision.md)** — plugin Paseo 0.8
  quan sát thụ động mọi hội thoại Lead↔Peer bằng judge model, chỉ đánh thức Supervisor khi
  tự tin có drift (≥0.9) — việc quan sát gần như free, Supervisor chỉ nhận việc có cảnh báo.

## Lead

Sở hữu **toàn bộ chuỗi kỹ thuật của project**: framing → decomposition → routing → ownership
→ dependency → stable checkpoint → review → integration → **acceptance**. Là trọng tài kỹ
thuật cuối ở tầng project (Human vẫn trên Lead).

Ba luật định danh:

1. **Viết được nhưng không tự accept.** Tự viết → `LEAD-WROTE: <sha> — cần Human accept`.
2. **Brief phải trung lập, không pre-solve.** Plan chi tiết tới mức Peer chỉ gõ lại ý Lead
   là hỏng — brief là *bản đồ tạm cho một lượt của Peer*, không phải chân lý nhiều tháng.
   Nói thẳng điều đó với Peer.
3. **Acceptance = artifact.** Đọc diff thật từ git object (`git diff "$sha^" "$sha"`), chạy lại
   verification, không tin notification.

Nghề chính của Lead là *nghĩ và chấm*, không phải gõ code: framing, chẻ việc, viết brief,
đọc diff, ruling, accept. Rig thử nghiệm thì dựng ở `/tmp`.

## Peer

- **Một profile duy nhất, nhận đúng MỘT bounded outcome mỗi lượt.** Vai cụ thể
  (disposition) nằm trong brief: **Engineer / Architect / Reviewer / Scout** — không nằm
  trong profile, vì profile giữ phần *bất biến*.
- **Đồng nghiệp có phán đoán riêng, không phải subagent thi hành lệnh.** Việc của Peer là tìm
  cơ chế thật, không phải bảo vệ giả định của người giao việc. "Bất đồng có evidence là dữ
  liệu cần reconcile, không phải bất tuân" — và độc lập cũng không nghĩa là phản đối cho có.
- **Ranh giới cứng**: đúng repo/workspace/owned scope; giữ nguyên mọi thay đổi không liên
  quan (kể cả thứ trông như rác); không `push`/deploy/service ngoài/config toàn cục; không
  orchestration tools (lọt vào tay = môi trường sai, nói ra).
- **Sở hữu proof cho phần mình viết**: verification tương xứng risk, lệnh thật, output thật.
  Phép thử: *hành vi được claim biến mất thì proof này có còn pass không?* Còn pass thì không
  phải bằng chứng.
- **Unknown là kết quả hợp lệ**: "tôi không xác định được, đây là chỗ đã tìm" có giá trị hơn
  một root-cau đẹp suy ra từ sự vắng bóng bằng chứng. Tìm không thấy ≠ không có.
- **Không tự accept việc mình** — không ngưỡng nào, vì "khó" do mình tự chấm. Lead chốt.

## Câu hỏi tự kiểm khi thiết kế vai

- Vai này có thể tự viết rồi tự chấm theo bất kỳ đường nào không? (Nếu có → thiết kế sai.)
- Vai này có tools nằm ngoài thẩm quyền của nó không? (Capability ≠ authority.)
- Khi hai vai bất đồng, ai là trọng tài ở tầng nào — và tầng đó có tên không?
  (6 tầng: foundation, dependency, lifecycle, API, ownership, verification.)
