<script lang="ts">
  // Shown when a module is selected but no compatible file is open.
  export let icon: string;
  export let title: string;
  export let sub: string;
</script>

<div class="flex-1 grid place-items-center text-center p-8">
  <div>
    <p class="text-4xl mb-3">{icon}</p>
    <h2 class="text-lg font-medium mb-1">{title}</h2>
    <p class="text-sm text-gray-500 dark:text-gray-400">{sub}</p>
  </div>
</div>
