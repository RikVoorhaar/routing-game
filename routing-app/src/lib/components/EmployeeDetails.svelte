<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { formatMoney, formatAddress, formatTimeFromMs } from '$lib/formatting';
  import { 
    getEmployeeVehicleConfig, 
    getEmployeeCapacity,
    canEmployeeDoJobCategory,
  } from '$lib/employeeUtils';
  import { 
    VehicleType, 
    LicenseType, 
    getVehicleConfig, 
    getLicenseConfig,
    VEHICLE_CONFIGS
  } from '$lib/vehicles';
  import {
    computeUpgradeCost,
    getUpgradeInfo
  } from '$lib/upgrades';
  import { JobCategory, CATEGORY_NAMES, CATEGORY_ICONS } from '$lib/jobCategories';
  import type { Address, Employee ,ActiveJob} from '$lib/server/db/schema';

  export let employee: Employee | null = null;
  export let activeJob: ActiveJob | null = null;



  let activeTab: 'route' | 'levels' | 'upgrades' = 'route';

  // Route progress calculation
  $: routeProgress = activeJob && activeJob.startTime ? 
    calculateRouteProgress(activeJob) : null;

  function calculateRouteProgress(activeJob: ActiveJob) {
    if (!activeJob.startTime || !activeJob.endTime) return null;
    
    const startTime = new Date(activeJob.startTime).getTime();
    const endTime = new Date(activeJob.endTime).getTime();
    const currentTime = Date.now();

    const elapsed = currentTime - startTime;
    const totalDuration = new Date(endTime).getTime() - startTime;
    const progress = Math.min(100, (elapsed / totalDuration) * 100);
    const remainingTime = Math.max(0, totalDuration - elapsed);
    
    return {
      progress,
      remainingTimeMs: remainingTime,
      isComplete: progress >= 100
    };
  }


  function getNextLicense(currentLicense: LicenseType): LicenseType | null {
    const nextLevel = currentLicense + 1;
    return nextLevel <= LicenseType.TOXIC_GOODS ? nextLevel as LicenseType : null;
  }

  function getNextVehicle(currentVehicle: VehicleType, licenseLevel: LicenseType): VehicleType | null {
    for (let vehicleType = currentVehicle + 1; vehicleType <= VehicleType.DOUBLE_TRAILER_TRUCK; vehicleType++) {
      const config = VEHICLE_CONFIGS[vehicleType as VehicleType];
      if (config.minLicenseLevel <= licenseLevel) {
        return vehicleType as VehicleType;
      }
    }
    return null;
  }

  function getXPForNextLevel(level: number): number {
    return level * 100;
  }

  function handlePurchaseLicense(licenseType: LicenseType) {
    // TODO: Implement license purchase
  }

  function handlePurchaseVehicle(vehicleType: VehicleType) {
    // TODO: Implement vehicle purchase
  }

  function handlePurchaseUpgrade(category: JobCategory) {
    // TODO: Implement upgrade purchase
  }
</script>

{#if employee}
  <div class="card bg-base-100 shadow-lg">
    <div class="card-body p-4">
      <div class="flex justify-between items-center mb-4">
        <h2 class="card-title text-xl">{employee.name}</h2>
        <div class="badge badge-primary">{getVehicleConfig(employee.vehicleLevel).name}</div>
      </div>

      <!-- Tabs -->
      <div class="tabs tabs-boxed mb-4">
        <button 
          class="tab"
          class:tab-active={activeTab === 'route'}
          on:click={() => activeTab = 'route'}
        >
          Route
        </button>
        <button 
          class="tab"
          class:tab-active={activeTab === 'levels'}
          on:click={() => activeTab = 'levels'}
        >
          Levels
        </button>
        <button 
          class="tab"
          class:tab-active={activeTab === 'upgrades'}
          on:click={() => activeTab = 'upgrades'}
        >
          Upgrades
        </button>
      </div>

      <!-- Tab Content -->
      {#if activeTab === 'route'}
        <div class="space-y-4">
          {#if activeJob}
            <div>
              <div class="flex justify-between items-center mb-2">
                <span class="font-medium">Route Progress</span>
                <span class="text-sm text-base-content/70">
                  {routeProgress ? Math.round(routeProgress.progress) : 0}%
                </span>
              </div>
              
              <progress 
                class="progress progress-primary w-full mb-2" 
                value={routeProgress?.progress || 0} 
                max="100"
              ></progress>
              
              {#if routeProgress && !routeProgress.isComplete}
                <div class="text-sm text-base-content/70">
                  ETA: {formatTimeFromMs(routeProgress.remainingTimeMs)}
                </div>
              {:else if routeProgress && routeProgress.isComplete}
                <div class="text-sm text-success font-medium">
                  ✅ Route Completed!
                </div>
              {/if}
            </div>

            <!-- Route Details -->
            <div class="space-y-3">
              <div>
                <strong>From:</strong> {formatLocation(currentRoute.startLocation)}
              </div>
              <div>
                <strong>To:</strong> {formatLocation(currentRoute.endLocation)}
              </div>
              <div class="flex justify-between">
                <span><strong>Goods:</strong> {currentRoute.goodsType}</span>
                <span><strong>Weight:</strong> {currentRoute.weight} kg</span>
              </div>
              <div class="flex justify-between">
                <span><strong>Distance:</strong> {Math.round(parseFloat(currentRoute.lengthTime) / 60)} min</span>
                <span><strong>Reward:</strong> {formatMoney(currentRoute.reward)}</span>
              </div>
            </div>
          {:else}
            <div class="text-center py-8">
              <div class="text-4xl mb-2">🚗</div>
              <p class="text-base-content/70">Employee is currently idle</p>
              <p class="text-sm text-base-content/50 mt-1">Assign a job from the job market</p>
            </div>
          {/if}
        </div>

      {:else if activeTab === 'levels'}
        <div class="space-y-4">
          <!-- Driving Level -->
          <div class="p-3 bg-base-200 rounded-lg">
            <div class="flex justify-between items-center mb-2">
              <span class="font-medium flex items-center gap-2">
                🚗 Driving
              </span>
              <span class="text-sm">Level {employee.drivingLevel.level}</span>
            </div>
            <progress 
              class="progress progress-info w-full" 
              value={employee.drivingLevel.xp} 
              max={getXPForNextLevel(employee.drivingLevel.level)}
            ></progress>
            <div class="text-xs text-base-content/70 mt-1">
              {employee.drivingLevel.xp} / {getXPForNextLevel(employee.drivingLevel.level)} XP
            </div>
          </div>

          <!-- Category Levels -->
          {#each Object.entries(JobCategory).filter(([key, value]) => typeof value === 'number') as [key, category]}
            {@const categoryLevel = employee.categoryLevel[category]}
            {@const canDoCategory = canEmployeeDoJobCategory(employee, category)}
            {@const categoryName = CATEGORY_NAMES[category]}
            {@const categoryIcon = CATEGORY_ICONS[category]}
            
            <div class="p-3 bg-base-200 rounded-lg" class:opacity-60={!canDoCategory}>
              <div class="flex justify-between items-center mb-2">
                <span class="font-medium flex items-center gap-2">
                  {categoryIcon} {categoryName}
                  {#if !canDoCategory}
                    <svg class="w-4 h-4 text-warning" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clip-rule="evenodd" />
                    </svg>
                  {/if}
                </span>
                <span class="text-sm">Level {categoryLevel.level}</span>
              </div>
              <progress 
                class="progress w-full"
                class:progress-success={canDoCategory}
                class:progress-warning={!canDoCategory}
                value={categoryLevel.xp} 
                max={getXPForNextLevel(categoryLevel.level)}
              ></progress>
              <div class="text-xs text-base-content/70 mt-1">
                {categoryLevel.xp} / {getXPForNextLevel(categoryLevel.level)} XP
                {#if !canDoCategory}
                  <span class="text-warning ml-2">Requires license upgrade</span>
                {/if}
              </div>
            </div>
          {/each}
        </div>

      {:else if activeTab === 'upgrades'}
        {@const currentVehicleConfig = getVehicleConfig(employee.vehicleLevel)}
        <div class="space-y-6">
          <!-- License Upgrade -->
          <div class="space-y-3">
            <h3 class="font-semibold text-lg">License</h3>
            <div class="p-3 bg-base-200 rounded-lg">
              <div class="flex justify-between items-center mb-2">
                <span>Current: {getLicenseConfig(employee.licenseLevel).name}</span>
                <div class="badge badge-secondary">Level {employee.drivingLevel.level}</div>
              </div>
              
              {#if getNextLicense(employee.licenseLevel) !== null}
                {@const nextLicense = getNextLicense(employee.licenseLevel)}
                {@const nextLicenseConfig = getLicenseConfig(nextLicense)}
                {@const canUpgrade = employee.drivingLevel.level >= nextLicenseConfig.minDrivingLevel}
                
                <button 
                  class="btn btn-primary btn-sm w-full"
                  disabled={!canUpgrade}
                  on:click={() => handlePurchaseLicense(nextLicense)}
                >
                  {#if canUpgrade}
                    Upgrade to {nextLicenseConfig.name} ({formatMoney(nextLicenseConfig.cost)})
                  {:else}
                    Requires Driving Level {nextLicenseConfig.minDrivingLevel}
                  {/if}
                </button>
              {:else}
                <div class="text-center text-success">
                  🏆 Max license achieved!
                </div>
              {/if}
            </div>
          </div>

          <!-- Vehicle Upgrade -->
          <div class="space-y-3">
            <h3 class="font-semibold text-lg">Vehicle</h3>
            <div class="p-3 bg-base-200 rounded-lg">
              <div class="flex justify-between items-center mb-2">
                <span>Current: {currentVehicleConfig.name}</span>
                <div class="badge badge-accent">{getEmployeeCapacity(employee)} capacity</div>
              </div>
              
              {#if getNextVehicle(employee.vehicleLevel, employee.licenseLevel) !== null}
                {@const nextVehicle = getNextVehicle(employee.vehicleLevel, employee.licenseLevel)}
                {@const nextVehicleConfig = getVehicleConfig(nextVehicle)}
                
                <button 
                  class="btn btn-primary btn-sm w-full"
                  on:click={() => handlePurchaseVehicle(nextVehicle)}
                >
                  Upgrade to {nextVehicleConfig.name} ({formatMoney(nextVehicleConfig.baseCost)})
                </button>
              {:else}
                <div class="text-center text-success">
                  🏆 Best available vehicle!
                </div>
              {/if}
            </div>
          </div>

          <!-- Category Upgrades -->
          <div class="space-y-3">
            <h3 class="font-semibold text-lg">Category Upgrades</h3>
            {#each Object.entries(JobCategory).filter(([key, value]) => typeof value === 'number') as [key, category]}
              {@const upgradeInfo = getUpgradeInfo(category)}
              {@const currentLevel = employee.upgradeState[category]}
              {@const categoryLevel = employee.categoryLevel[category]}
              {@const upgradeCost = computeUpgradeCost(category, currentLevel + 1)}
              {@const canUpgrade = categoryLevel.level > currentLevel}
              {@const categoryName = CATEGORY_NAMES[category]}
              {@const categoryIcon = CATEGORY_ICONS[category]}
              
              <!-- Calculate current effect -->
              {@const currentEffect = (() => {
                switch(category) {
                  case JobCategory.GROCERIES:
                    return `${currentLevel * 5}%`;
                  case JobCategory.PACKAGES:
                    return `${currentLevel * 20}%`;
                  case JobCategory.FOOD:
                    return `${currentLevel * 5}%`;
                  case JobCategory.FURNITURE:
                    return `${currentLevel * 5}%`;
                  case JobCategory.PEOPLE:
                    return `${currentLevel * 10}%`;
                  case JobCategory.FRAGILE_GOODS:
                    return `+${currentLevel * 5} km/h`;
                  case JobCategory.CONSTRUCTION:
                    return `${currentLevel * 20}%`;
                  case JobCategory.LIQUIDS:
                    return `${currentLevel * 5}%`;
                  case JobCategory.TOXIC_GOODS:
                    return `${currentLevel * 10}%`;
                  default:
                    return '0%';
                }
              })()}
              
              <div class="p-3 bg-base-200 rounded-lg">
                <div class="flex justify-between items-center mb-2">
                  <span class="font-medium flex items-center gap-2">
                    {categoryIcon} {upgradeInfo.name}
                  </span>
                  <div class="badge badge-ghost">Level {currentLevel}</div>
                </div>
                
                <p class="text-sm text-base-content/70 mb-2">
                  {upgradeInfo.effectDescription} (current: {currentEffect})
                </p>
                
                <button 
                  class="btn btn-primary btn-sm w-full"
                  disabled={!canUpgrade}
                  on:click={() => handlePurchaseUpgrade(category)}
                >
                  {#if canUpgrade}
                    Upgrade ({formatMoney(upgradeCost)})
                  {:else}
                    Requires {categoryName} Level {currentLevel + 1}
                  {/if}
                </button>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  </div>
{:else}
  <div class="card bg-base-100 shadow-lg">
    <div class="card-body p-8 text-center">
      <div class="text-4xl mb-4">👥</div>
      <h3 class="text-xl font-bold mb-2">No Employee Selected</h3>
      <p class="text-base-content/70">Click on an employee to view their details</p>
    </div>
  </div>
{/if} 