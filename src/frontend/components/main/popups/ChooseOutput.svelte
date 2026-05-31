<script lang="ts">
    import { popupData } from "../../../stores"
    import { translateText } from "../../../utils/language"
    import MaterialMultiChoice from "../../inputs/MaterialMultiChoice.svelte"

    const outputTypes = [
        { id: "normal", name: "Audience / Projector", icon: "display_settings", title: translateText("settings.normal") },
        { id: "stage", name: "Worship Leader / Stage", icon: "stage", title: translateText("menu.stage") }
    ]

    function selectOutput(id) {
        popupData.set({ id: "choose_output", value: id })
    }
</script>

<MaterialMultiChoice options={outputTypes} on:click={(e) => selectOutput(e.detail)} />
